-- Add ai_invoice_id to chat_messages for linking AI-detected company payments
ALTER TABLE IF EXISTS "public"."chat_messages"
ADD COLUMN IF NOT EXISTS "ai_invoice_id" UUID REFERENCES "public"."invoices"("id") ON DELETE SET NULL;
