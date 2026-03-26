-- Add transaction_date to staff_ledger
ALTER TABLE public.staff_ledger
  ADD COLUMN IF NOT EXISTS transaction_date DATE NOT NULL DEFAULT CURRENT_DATE;
