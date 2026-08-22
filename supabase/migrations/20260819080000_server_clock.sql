-- Client clocks can't be trusted (devices are sometimes badly out of sync
-- with real time). The app's last-write-wins guards compare a locally
-- generated `client_updated_at` against the server's — a skewed local clock
-- makes those guards silently reject writes that should apply. Exposes the
-- server's own clock so the client can measure and correct for the offset.
create or replace function public.now_utc()
returns timestamptz
language sql stable
as $$
  select now();
$$;

grant execute on function public.now_utc() to anon, authenticated;
