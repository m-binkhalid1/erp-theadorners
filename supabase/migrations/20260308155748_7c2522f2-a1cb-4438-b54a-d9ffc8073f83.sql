
-- Create inventory categories table
CREATE TABLE public.inventory_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.inventory_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage categories" ON public.inventory_categories FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Employees can view categories" ON public.inventory_categories FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'employee'));

-- Add item_type and min_stock_level to inventory
ALTER TABLE public.inventory 
  ADD COLUMN item_type text NOT NULL DEFAULT 'reusable',
  ADD COLUMN min_stock_level integer NOT NULL DEFAULT 0,
  ADD COLUMN available_quantity integer NOT NULL DEFAULT 0;

-- Create transaction type enum
CREATE TYPE public.inventory_transaction_type AS ENUM (
  'sent_to_event', 'returned', 'damaged', 'consumed', 'restocked', 'adjustment'
);

-- Create inventory transactions table
CREATE TABLE public.inventory_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_item_id uuid NOT NULL REFERENCES public.inventory(id) ON DELETE CASCADE,
  event_id uuid REFERENCES public.events(id) ON DELETE SET NULL,
  transaction_type inventory_transaction_type NOT NULL,
  quantity integer NOT NULL,
  notes text DEFAULT '',
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.inventory_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage transactions" ON public.inventory_transactions FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin')) WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Employees can view transactions" ON public.inventory_transactions FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'employee'));

-- Enable realtime for transactions
ALTER PUBLICATION supabase_realtime ADD TABLE public.inventory_transactions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.inventory_categories;
