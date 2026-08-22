import { supabase } from '@/integrations/supabase/client';

/**
 * Client clocks can't be trusted (devices are sometimes badly out of sync
 * with real time). The last-write-wins guards in store.ts compare a
 * locally-generated `client_updated_at` against the server's own — a
 * skewed local clock makes those guards silently reject writes that should
 * apply (PostgREST returns 200 with zero rows affected, not an error).
 * `syncServerClock` measures the offset to the server's clock once per
 * session; `nowIso` applies that correction to every timestamp we generate
 * for sync.
 */
let offsetMs = 0;

export function nowIso(): string {
  return new Date(Date.now() + offsetMs).toISOString();
}

export async function syncServerClock(): Promise<void> {
  const t0 = Date.now();
  const { data, error } = await supabase.rpc('now_utc');
  if (error || !data) return;
  const t1 = Date.now();
  const serverMs = new Date(data as unknown as string).getTime();
  if (Number.isNaN(serverMs)) return;
  // Split the round trip evenly between request and response to estimate
  // what the server's clock read at t0.
  offsetMs = serverMs - Math.round((t0 + t1) / 2);
}
