-- Add ledger_label for custom display names in ledger
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS ledger_label TEXT NOT NULL DEFAULT '';
