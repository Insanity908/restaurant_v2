ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS client_updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.restaurant_tables ADD COLUMN IF NOT EXISTS client_updated_at timestamptz NOT NULL DEFAULT now();
CREATE INDEX IF NOT EXISTS idx_orders_client_updated_at ON public.orders (client_updated_at);