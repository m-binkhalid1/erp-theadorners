import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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

    // Verify user
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(authHeader.replace("Bearer ", ""));
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const userId = claimsData.claims.sub;

    const { message, messageId } = await req.json();
    if (!message || !messageId) throw new Error("Missing message or messageId");

    // Use tool calling to extract structured event data OR staff ledger entry
    const aiResponse = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GEMINI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `You are a smart assistant for "The Adorners", a balloon decoration & event management company in Lahore, Pakistan.

Your job is to analyze employee chat messages and determine if they describe:
1. An EVENT booking/details, OR
2. A STAFF PAYMENT/EXPENSE (employee ne paise liye, advance, salary, dihari, kharcha etc.), OR
3. Neither (just a normal chat message)

## EVENT EXTRACTION
Extract these fields for events:
- client_name: The CONTACT PERSON who is coordinating with us (e.g. "Anthony", "Ali", "Moen")
- coordinator_company: The EVENT MANAGEMENT COMPANY organizing it (optional, e.g. "Ignite Events")
- event_of_company: The END CLIENT COMPANY whose event this is (optional, e.g. "Food Panda")
- event_place: Where the event is happening
- phone_no: Client phone number (Pakistani format)
- date: Event date (ISO format YYYY-MM-DD)
- items: Array of items needed. Each item: description (string), qty (number), unit_price (number)
- employees: Which employees are going
- details: Any other event details

IMPORTANT DISTINCTION:
- client_name = the PERSON we are in contact with
- coordinator_company = the EVENT COMPANY organizing it
- event_of_company = whose event it actually IS

## STAFF PAYMENT EXTRACTION
If the message talks about giving money to an employee/worker, extract:
- staff_name: Name of the worker/employee who received money
- staff_amount: Amount in PKR
- staff_reason: Why were they given money (advance, salary, daily wage, event expense, personal need, etc.)
- staff_type: One of: "advance", "salary", "daily_wage", "expense", "event_expense", "other"

Examples of staff payment messages:
- "Ali ko 5000 diye advance" → staff payment
- "Usman ki aaj ki dihari 2000 de do" → staff payment (daily_wage)
- "Bilal ne event k kharche k liye 3000 liye" → staff payment (event_expense)
- "Ahmed ki March salary 25000 di" → staff payment (salary)
- "falan bande ne itne paise liye" → staff payment

For dates: if they say "kal" or "tomorrow" assume the next day from today. "Aaj" means today.
Today's date is: ${new Date().toISOString().split("T")[0]}`
          },
          { role: "user", content: message }
        ],
        tools: [
          {
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
                    type: "array",
                    description: "Items needed for the event",
                    items: {
                      type: "object",
                      properties: {
                        description: { type: "string", description: "Item name (e.g. Balloons, Danglers, Flowers)" },
                        qty: { type: "number", description: "Quantity" },
                        unit_price: { type: "number", description: "Price per unit" },
                      },
                    },
                  },
                  employees: { type: "string", description: "Assigned employees" },
                  details: { type: "string", description: "Other event details" },
                },
                required: ["is_event"],
                additionalProperties: false,
              },
            },
          },
          {
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
                },
                required: ["is_staff_payment"],
                additionalProperties: false,
              },
            },
          },
        ],
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

    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // ──────────────────────────────────────────
    // STAFF PAYMENT PATH
    // ──────────────────────────────────────────
    if (fnName === "extract_staff_payment" && extracted.is_staff_payment) {
      const { data: staffData, error: staffError } = await adminClient.from("staff_ledger").insert({
        worker_name: (extracted.staff_name || "Unknown").trim(),
        amount: extracted.staff_amount || 0,
        transaction_type: extracted.staff_type || "other",
        description: (extracted.staff_reason || "").trim(),
        status: "pending_ai",
        created_by: userId,
      }).select("id").single();

      if (staffError) {
        console.error("Staff ledger creation error:", staffError);
        throw new Error("Failed to create staff ledger entry");
      }

      // Mark chat message
      await adminClient.from("chat_messages").update({
        is_ai_processed: true,
        ai_staff_ledger_id: staffData.id,
      }).eq("id", messageId);

      return new Response(JSON.stringify({
        is_event: false,
        is_staff_payment: true,
        staff_ledger_id: staffData.id,
        extracted,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ──────────────────────────────────────────
    // EVENT PATH
    // ──────────────────────────────────────────
    if (fnName === "extract_event" && extracted.is_event) {
      // Build event_items from extracted items
      const eventItems = (extracted.items || []).map((i: any) => ({
        description: i.description || "",
        qty: i.qty || 0,
        unit_price: i.unit_price || 0,
        subtotal: (i.qty || 0) * (i.unit_price || 0),
      }));
      const totalAmount = eventItems.reduce((s: number, i: any) => s + i.subtotal, 0);

      const clientName = (extracted.client_name || "Unknown").trim();
      const eventOfCompany = (extracted.event_of_company || "").trim();

      const { data: eventData, error: eventError } = await adminClient.from("events").insert({
        company: eventOfCompany,
        client_name: clientName,
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

      // Mark chat message as AI processed
      await adminClient.from("chat_messages").update({
        is_ai_processed: true,
        ai_event_id: eventData.id,
      }).eq("id", messageId);

      return new Response(JSON.stringify({
        is_event: true,
        is_staff_payment: false,
        event_id: eventData.id,
        extracted,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ──────────────────────────────────────────
    // NEITHER EVENT NOR STAFF PAYMENT
    // ──────────────────────────────────────────
    return new Response(JSON.stringify({ is_event: false, is_staff_payment: false }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e) {
    console.error("extract-event error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
