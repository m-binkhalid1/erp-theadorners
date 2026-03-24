-- Add new fields to events table for client/coordinator/dynamic items
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS client_name TEXT NOT NULL DEFAULT '';
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS coordinator_company TEXT NOT NULL DEFAULT '';
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS coordinator_name TEXT NOT NULL DEFAULT '';
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS event_items JSONB NOT NULL DEFAULT '[]';
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS total_amount NUMERIC NOT NULL DEFAULT 0;

-- Migrate existing data: copy company to client_name for backward compatibility
UPDATE public.events SET client_name = company WHERE client_name = '';

-- Add invoice client_name column for proper sync
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS client_name TEXT NOT NULL DEFAULT '';

-- Migrate existing invoice data
UPDATE public.invoices SET client_name = company WHERE client_name = '';
