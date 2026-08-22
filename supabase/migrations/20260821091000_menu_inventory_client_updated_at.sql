-- menu_items/inventory_items eram os únicos stores em src/lib/store.ts sem a
-- protecção "last-write-wins" que tables/orders já têm (client_updated_at +
-- .guard()) — uma edição enfileirada (offline/rede lenta) podia ser
-- sobrescrita por um refetch mais antigo. Traz os dois para o mesmo padrão.

alter table public.menu_items add column if not exists client_updated_at timestamptz not null default now();
alter table public.inventory_items add column if not exists client_updated_at timestamptz not null default now();
