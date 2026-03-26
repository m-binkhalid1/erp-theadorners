import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── Tool Definitions ──
const TOOL_EVENT = {
  type: "function",
  function: {
    name: "extract_event",
    description: "Extract event details from a chat message or indicate it's not an event.",
    parameters: {
      type: "object",
      properties: {
        is_event: { type: "boolean", description: "Whether this message describes an event" },
        client_name: { type: "string", description: "Contact person name — who we deal with (e.g. Anthony, Ali)" },
        coordinator_company: { type: "string", description: "Event management company organizing it (e.g. Ignite Events)" },
        event_of_company: { type: "string", description: "End client company whose event this is (e.g. Food Panda)" },
        event_place: { type: "string", description: "Event venue/location" },
        phone_no: { type: "string", description: "Client phone number" },
        date: { type: "string", description: "Event date in YYYY-MM-DD format" },
        items: {
          type: "array", description: "Items needed for the event",
          items: { type: "object", properties: { description: { type: "string" }, qty: { type: "number" }, unit_price: { type: "number" } } },
        },
        employees: { type: "string", description: "Assigned employees" },
        details: { type: "string", description: "Other event details" },
      },
      required: ["is_event"], additionalProperties: false,
    },
  },
};

const TOOL_STAFF = {
  type: "function",
  function: {
    name: "extract_staff_payment",
    description: "Extract staff/employee payment details from a chat message.",
    parameters: {
      type: "object",
      properties: {
        is_staff_payment: { type: "boolean", description: "Whether this message describes a staff payment/expense" },
        staff_name: { type: "string", description: "Name of the worker/employee" },
        staff_amount: { type: "number", description: "Amount in PKR" },
        staff_reason: { type: "string", description: "Reason for the payment" },
        staff_type: { type: "string", enum: ["advance", "salary", "daily_wage", "expense", "event_expense", "other"], description: "Type of payment" },
        staff_date: { type: "string", description: "Date when money was given, in YYYY-MM-DD format" },
      },
      required: ["is_staff_payment"], additionalProperties: false,
    },
  },
};

const TOOL_COMPANY_PAYMENT = {
  type: "function",
  function: {
    name: "extract_company_payment",
    description: "Extract client/company cheque or payment received details from a chat message.",
    parameters: {
      type: "object",
      properties: {
        is_company_payment: { type: "boolean", description: "Whether this message describes a company/client payment received" },
        company_name: { type: "string", description: "Company or client name who made the payment" },
        payment_amount: { type: "number", description: "Amount received in PKR" },
        payment_method: { type: "string", description: "e.g. cheque, cash, bank transfer" },
        payment_description: { type: "string", description: "Any additional details about the payment" },
      },
      required: ["is_company_payment"], additionalProperties: false,
    },
  },
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not configured");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(authHeader.replace("Bearer ", ""));
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const userId = claimsData.claims.sub;

    const { message, messageId, expectedType } = await req.json();
    if (!message || !messageId) throw new Error("Missing message or messageId");

    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // ── Fetch existing names for intelligent matching ──
    let knownCompanies: string[] = [];
    let knownStaff: string[] = [];
    try {
      const { data: compData } = await adminClient.from("invoices").select("company");
      if (compData) {
        const set = new Set<string>();
        compData.forEach((r: any) => { if (r.company?.trim()) set.add(r.company.trim()); });
        knownCompanies = Array.from(set);
      }
      const { data: staffData } = await adminClient.from("staff_ledger").select("worker_name");
      if (staffData) {
        const set = new Set<string>();
        staffData.forEach((r: any) => { if (r.worker_name?.trim()) set.add(r.worker_name.trim()); });
        knownStaff = Array.from(set);
      }
    } catch (e) {
      console.error("Failed to fetch known names:", e);
    }

    const knownNamesBlock = `

## KNOWN ENTITIES (VERY IMPORTANT)
Below are the EXACT names already in our database. You MUST use these exact spellings if the message refers to any of them (even with typos, different casing, missing spaces, or slight variations).
Only create a completely NEW name if it clearly does NOT match any of these.

### Known Companies/Clients:
${knownCompanies.length > 0 ? knownCompanies.map(n => `- "${n}"`).join("\n") : "(none yet)"}

### Known Staff/Workers:
${knownStaff.length > 0 ? knownStaff.map(n => `- "${n}"`).join("\n") : "(none yet)"}

RULE: If the user writes "cloud9" and known company is "Cloud 9", return "Cloud 9". If user writes "ussman" and known staff is "Usman", return "Usman". Always prefer the EXACT known spelling.`;

    // ── Select tools based on expectedType ──
    let tools: any[];
    let systemExtra = "";
    if (expectedType === "event") {
      tools = [TOOL_EVENT];
      systemExtra = "\n\nIMPORTANT: The user has explicitly selected EVENT mode. You MUST use the extract_event tool. Treat this message as an event description.";
    } else if (expectedType === "staff") {
      tools = [TOOL_STAFF];
      systemExtra = "\n\nIMPORTANT: The user has explicitly selected STAFF PAYMENT mode. You MUST use the extract_staff_payment tool. Treat this message as a staff/employee payment.";
    } else if (expectedType === "company_payment") {
      tools = [TOOL_COMPANY_PAYMENT];
      systemExtra = "\n\nIMPORTANT: The user has explicitly selected COMPANY PAYMENT mode. You MUST use the extract_company_payment tool. Treat this message as a company/client cheque or payment received.";
    } else {
      tools = [TOOL_EVENT, TOOL_STAFF, TOOL_COMPANY_PAYMENT];
    }

    const aiResponse = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${GEMINI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `You are a smart assistant for "The Adorners", a balloon decoration & event management company in Lahore, Pakistan.

Your job is to analyze employee chat messages and determine the message type:
1. An EVENT booking/details
2. A STAFF PAYMENT/EXPENSE (employee ne paise liye, advance, salary, dihari, kharcha etc.)
3. A COMPANY PAYMENT RECEIVED (client/company se cheque ya payment mili)
4. Neither (just a normal chat message)

## EVENT EXTRACTION
Extract these fields for events:
- client_name: The CONTACT PERSON (e.g. "Anthony", "Ali", "Moen")
- coordinator_company: The EVENT MANAGEMENT COMPANY organizing it (optional)
- event_of_company: The END CLIENT COMPANY whose event this is (optional)
- event_place: Where the event is happening
- phone_no: Client phone number (Pakistani format)
- date: Event date (ISO format YYYY-MM-DD)
- items: Array of items. Each item: description, qty, unit_price
- employees: Which employees are going
- details: Any other event details

IMPORTANT DISTINCTION:
- client_name = the PERSON we are in contact with
- coordinator_company = the EVENT COMPANY organizing it
- event_of_company = whose event it actually IS

## STAFF PAYMENT EXTRACTION
If the message talks about giving money to an employee/worker:
- staff_name: Name of the worker/employee who received money
- staff_amount: Amount in PKR
- staff_reason: Why were they given money
- staff_type: One of: "advance", "salary", "daily_wage", "expense", "event_expense", "other"
- staff_date: Date when the money was given (YYYY-MM-DD). Default to today if not mentioned.

Examples:
- "Ali ko 5000 diye advance" → staff payment
- "Usman ki aaj ki dihari 2000 de do" → staff payment (daily_wage)
- "Bilal ne event k kharche k liye 3000 liye" → staff payment (event_expense)
- "Ahmed ki March salary 25000 di" → staff payment (salary)
- "ghazi ne 25 march 2026 ko food panda ka event pr 500 lia khana ka lia" → staff payment (event_expense), staff_date = 2025-03-25

## COMPANY PAYMENT RECEIVED
If the message talks about receiving money FROM a company/client:
- company_name: Name of the company or client who paid
- payment_amount: Amount received in PKR
- payment_method: How they paid (cheque, cash, bank transfer)
- payment_description: Any extra details

Examples:
- "Cloud 9 se 10000 ka cheque mil gaya" → company payment
- "Ignite Events ne 50000 transfer kiye" → company payment
- "Anthony ne 20000 cash diye hain" → company payment

For dates: if they say "kal" or "tomorrow" assume the next day from today. "Aaj" means today.
Today's date is: ${new Date().toISOString().split("T")[0]}${knownNamesBlock}${systemExtra}`
          },
          { role: "user", content: message }
        ],
        tools,
      }),
    });

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited, please try again later." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add funds." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const errText = await aiResponse.text();
      console.error("AI error:", aiResponse.status, errText);
      throw new Error("AI processing failed");
    }

    const aiData = await aiResponse.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error("No tool call response from AI");

    const fnName = toolCall.function.name;
    const extracted = JSON.parse(toolCall.function.arguments);
    console.log("Extracted:", fnName, extracted);

    // adminClient already created above

    // ──────────────────────────────────────────
    // STAFF PAYMENT PATH
    // ──────────────────────────────────────────
    if (fnName === "extract_staff_payment" && extracted.is_staff_payment) {
      const txDate = extracted.staff_date || new Date().toISOString().split("T")[0];
      const { data: staffData, error: staffError } = await adminClient.from("staff_ledger").insert({
        worker_name: (extracted.staff_name || "Unknown").trim(),
        amount: extracted.staff_amount || 0,
        transaction_type: extracted.staff_type || "other",
        description: (extracted.staff_reason || "").trim(),
        transaction_date: txDate,
        status: "pending_ai",
        created_by: userId,
      }).select("id").single();

      if (staffError) {
        console.error("Staff ledger creation error:", staffError);
        throw new Error("Failed to create staff ledger entry");
      }

      await adminClient.from("chat_messages").update({
        is_ai_processed: true,
        ai_staff_ledger_id: staffData.id,
      }).eq("id", messageId);

      return new Response(JSON.stringify({
        is_event: false, is_staff_payment: true, is_company_payment: false,
        staff_ledger_id: staffData.id, extracted,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ──────────────────────────────────────────
    // COMPANY PAYMENT PATH
    // ──────────────────────────────────────────
    if (fnName === "extract_company_payment" && extracted.is_company_payment) {
      const companyName = (extracted.company_name || "Unknown").trim();
      const paymentAmount = extracted.payment_amount || 0;
      const desc = [
        extracted.payment_method ? `Via ${extracted.payment_method}` : "",
        extracted.payment_description || "",
      ].filter(Boolean).join(" — ");

      // Create an invoice entry with total=0 and paid=paymentAmount
      // This will ADD to the company's "paid" column and reduce the remaining balance
      const { data: invData, error: invError } = await adminClient.from("invoices").insert({
        company: companyName,
        client_name: companyName,
        ledger_label: `💰 Payment Received${desc ? ` — ${desc}` : ""}`,
        total: 0,
        paid: paymentAmount,
        status: "pending_ai",
        items: [{ description: `Payment received: ${desc || "Cheque/Cash"}`, qty: 1, unit_price: 0, subtotal: 0 }],
      }).select("id").single();

      if (invError) {
        console.error("Company payment creation error:", invError);
        throw new Error("Failed to create company payment entry");
      }

      await adminClient.from("chat_messages").update({
        is_ai_processed: true,
        ai_invoice_id: invData.id,
      }).eq("id", messageId);

      return new Response(JSON.stringify({
        is_event: false, is_staff_payment: false, is_company_payment: true,
        invoice_id: invData.id, extracted,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ──────────────────────────────────────────
    // EVENT PATH
    // ──────────────────────────────────────────
    if (fnName === "extract_event" && extracted.is_event) {
      const eventItems = (extracted.items || []).map((i: any) => ({
        description: i.description || "",
        qty: i.qty || 0, unit_price: i.unit_price || 0,
        subtotal: (i.qty || 0) * (i.unit_price || 0),
      }));
      const totalAmount = eventItems.reduce((s: number, i: any) => s + i.subtotal, 0);

      const { data: eventData, error: eventError } = await adminClient.from("events").insert({
        company: (extracted.event_of_company || "").trim(),
        client_name: (extracted.client_name || "Unknown").trim(),
        coordinator_company: (extracted.coordinator_company || "").trim(),
        coordinator_name: "",
        event_place: (extracted.event_place || "TBD").trim(),
        phone_no: (extracted.phone_no || "").trim(),
        date: extracted.date || new Date().toISOString().split("T")[0],
        balloons: "",
        event_items: eventItems,
        total_amount: totalAmount,
        employees: (extracted.employees || "").trim(),
        details: (extracted.details || "").trim(),
        created_by: userId,
        status: "pending_ai",
        ai_source: true,
      }).select("id").single();

      if (eventError) {
        console.error("Event creation error:", eventError);
        throw new Error("Failed to create event");
      }

      await adminClient.from("chat_messages").update({
        is_ai_processed: true,
        ai_event_id: eventData.id,
      }).eq("id", messageId);

      return new Response(JSON.stringify({
        is_event: true, is_staff_payment: false, is_company_payment: false,
        event_id: eventData.id, extracted,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ──────────────────────────────────────────
    // NEITHER
    // ──────────────────────────────────────────
    return new Response(JSON.stringify({ is_event: false, is_staff_payment: false, is_company_payment: false }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e) {
    console.error("extract-event error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
