
ALTER TABLE public.events ADD COLUMN status text NOT NULL DEFAULT 'confirmed';
ALTER TABLE public.events ADD COLUMN ai_source boolean NOT NULL DEFAULT false;
