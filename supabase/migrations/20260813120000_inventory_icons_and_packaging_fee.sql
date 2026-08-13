-- Ícone/foto do produto de inventário (herdado pelo ingrediente da receita
-- quando ligado) e taxa de embalagem por pedido (takeaway/entrega).
alter table public.inventory_items add column if not exists icon text;
alter table public.inventory_items add column if not exists image text;

alter table public.orders add column if not exists packaging_fee numeric(12,2) not null default 0;
