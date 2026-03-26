-- Staff Ledger table for tracking employee/worker payments
CREATE TABLE IF NOT EXISTS public.staff_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_name TEXT NOT NULL,
  amount NUMERIC NOT NULL DEFAULT 0,
  transaction_type TEXT NOT NULL DEFAULT 'advance',
    -- advance, salary, daily_wage, expense, event_expense, other
  description TEXT DEFAULT '',
  event_id UUID REFERENCES public.events(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'approved',
    -- pending_ai, approved
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add ai_staff_ledger_id to chat_messages
ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS ai_staff_ledger_id UUID REFERENCES public.staff_ledger(id) ON DELETE SET NULL;

-- Enable RLS
ALTER TABLE public.staff_ledger ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users to read
CREATE POLICY "staff_ledger_select" ON public.staff_ledger
  FOR SELECT TO authenticated USING (true);

-- Allow all authenticated users to insert
CREATE POLICY "staff_ledger_insert" ON public.staff_ledger
  FOR INSERT TO authenticated WITH CHECK (true);

-- Allow all authenticated users to update
CREATE POLICY "staff_ledger_update" ON public.staff_ledger
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- Allow all authenticated users to delete
CREATE POLICY "staff_ledger_delete" ON public.staff_ledger
  FOR DELETE TO authenticated USING (true);

-- Enable realtime for staff_ledger
ALTER PUBLICATION supabase_realtime ADD TABLE public.staff_ledger;
