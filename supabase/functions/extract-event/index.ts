import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

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

    // Use tool calling to extract structured event data
    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content: `You are an event data extraction assistant for "The Adorners", a balloon decoration & event management company in Lahore, Pakistan.

Your job is to extract event details from employee chat messages. Employees describe events in casual Urdu/English (Roman Urdu).

Extract these fields:
- company: The client/company name
- event_place: Where the event is happening
- phone_no: Client phone number (Pakistani format)
- date: Event date (ISO format YYYY-MM-DD)
- balloons: Balloon details/quantity
- employees: Which employees are going
- details: Any other event details

If the message does NOT describe an event (just a greeting, question, or general chat), return is_event: false.
If it IS an event description, return is_event: true with as many fields as you can extract. Leave unknown fields as empty strings.
For dates: if they say "kal" or "tomorrow" assume the next day from today. "Aaj" means today. Parse relative dates.
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
                  company: { type: "string", description: "Client/company name" },
                  event_place: { type: "string", description: "Event venue/location" },
                  phone_no: { type: "string", description: "Client phone number" },
                  date: { type: "string", description: "Event date in YYYY-MM-DD format" },
                  balloons: { type: "string", description: "Balloon details" },
                  employees: { type: "string", description: "Assigned employees" },
                  details: { type: "string", description: "Other event details" },
                },
                required: ["is_event"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "extract_event" } },
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

    const extracted = JSON.parse(toolCall.function.arguments);
    console.log("Extracted:", extracted);

    if (!extracted.is_event) {
      return new Response(JSON.stringify({ is_event: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create event using service role
    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: eventData, error: eventError } = await adminClient.from("events").insert({
      company: extracted.company || "Unknown",
      event_place: extracted.event_place || "TBD",
      phone_no: extracted.phone_no || "",
      date: extracted.date || new Date().toISOString().split("T")[0],
      balloons: extracted.balloons || "",
      employees: extracted.employees || "",
      details: extracted.details || "",
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
      event_id: eventData.id,
      extracted,
    }), {
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
