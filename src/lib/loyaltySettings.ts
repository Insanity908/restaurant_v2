// Loyalty & discount configuration, scoped per tenant.
// Cache-first (in-memory + localStorage); authoritative source is Supabase.
import { supabase } from '@/integrations/supabase/client';

export interface LoyaltySettings {
  enabled: boolean;
  pointsPerMT: number;
  mtPerPoint: number;
  tierBronzeMax: number;
  tierSilverMax: number;
  allowDiscounts: boolean;
  maxDiscountPercent: number;
}

export const DEFAULT_LOYALTY: LoyaltySettings = {
  enabled: false,
  pointsPerMT: 0.1,
  mtPerPoint: 1,
  tierBronzeMax: 50,
  tierSilverMax: 200,
  allowDiscounts: false,
  maxDiscountPercent: 0,
};

const BASE_KEY = 'loyalty_settings';

function scopedKey(): string {
  const tenantId = localStorage.getItem('current_tenant_id');
  return tenantId ? `${tenantId}__${BASE_KEY}` : BASE_KEY;
}

function readCache(): LoyaltySettings {
  try {
    const raw = localStorage.getItem(scopedKey());
    if (!raw) return { ...DEFAULT_LOYALTY };
    return { ...DEFAULT_LOYALTY, ...(JSON.parse(raw) as Partial<LoyaltySettings>) };
  } catch { return { ...DEFAULT_LOYALTY }; }
}
function writeCache(s: LoyaltySettings) {
  try { localStorage.setItem(scopedKey(), JSON.stringify(s)); } catch { /* quota */ }
}

/** Sync read from cache. */
export function getLoyaltySettings(): LoyaltySettings {
  return readCache();
}

/** Sync save (updates cache) + async upsert to Supabase. */
export function saveLoyaltySettings(patch: Partial<LoyaltySettings>): LoyaltySettings {
  const next = { ...readCache(), ...patch };
  writeCache(next);
  window.dispatchEvent(new CustomEvent('loyalty-settings-changed'));
  const tenantId = localStorage.getItem('current_tenant_id');
  if (tenantId) {
    void supabase.from('loyalty_settings').upsert({
      tenant_id: tenantId,
      enabled: next.enabled,
      points_per_mt: next.pointsPerMT,
      mt_per_point: next.mtPerPoint,
      allow_discounts: next.allowDiscounts,
      max_discount_percent: next.maxDiscountPercent,
      tiers: { bronzeMax: next.tierBronzeMax, silverMax: next.tierSilverMax },
    }, { onConflict: 'tenant_id' }).then(({ error }) => {
      if (error) console.warn('saveLoyaltySettings upsert failed', error.message);
    });
  }
  return next;
}

/** Hydrate cache from Supabase for the active tenant. */
export async function fetchLoyaltySettings(tenantId: string): Promise<LoyaltySettings> {
  const { data, error } = await supabase
    .from('loyalty_settings')
    .select('enabled, points_per_mt, mt_per_point, allow_discounts, max_discount_percent, tiers')
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (error) { console.warn('fetchLoyaltySettings failed', error.message); return readCache(); }
  if (!data) return readCache();
  const tiers = (data.tiers ?? {}) as { bronzeMax?: number; silverMax?: number };
  const merged: LoyaltySettings = {
    enabled: !!data.enabled,
    pointsPerMT: Number(data.points_per_mt) || DEFAULT_LOYALTY.pointsPerMT,
    mtPerPoint: Number(data.mt_per_point) || DEFAULT_LOYALTY.mtPerPoint,
    allowDiscounts: !!data.allow_discounts,
    maxDiscountPercent: Number(data.max_discount_percent) || 0,
    tierBronzeMax: Number(tiers.bronzeMax ?? DEFAULT_LOYALTY.tierBronzeMax),
    tierSilverMax: Number(tiers.silverMax ?? DEFAULT_LOYALTY.tierSilverMax),
  };
  writeCache(merged);
  window.dispatchEvent(new CustomEvent('loyalty-settings-changed'));
  return merged;
}

export function tierFromPoints(points: number, s: LoyaltySettings): 'Bronze' | 'Prata' | 'Ouro' {
  if (points >= s.tierSilverMax) return 'Ouro';
  if (points >= s.tierBronzeMax) return 'Prata';
  return 'Bronze';
}
