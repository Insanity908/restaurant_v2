import { supabase } from '@/integrations/supabase/client';
import { cloud } from './outbox';
import { warmStorageUrls, LOGO_BUCKET } from './storage';
import { tenantScopedKey } from './localCache';

export interface AppSettings {
  brandName: string;
  iconEmoji: string;
  iconUrl?: string;
  receiptLogo?: string;
  receiptShowLogo: boolean;
  primaryHue: number;
  primarySaturation: number;
  primaryLightness: number;
  backgroundHue: number;
  backgroundSaturation: number;
  backgroundLightness: number;
  mpesaNumber: string;
  mpesaName: string;
  emolaNumber: string;
  bankName: string;
  bankAccount: string;
  bankIban: string;
  bankHolder: string;
  taxId: string;
  address: string;
  phone: string;
}

const CACHE_BASE = 'app_settings_v1';
const CACHE_KEY = () => tenantScopedKey(CACHE_BASE);

export const DEFAULT_SETTINGS: AppSettings = {
  brandName: 'SABOR DE NAMPULA',
  iconEmoji: '☕',
  iconUrl: undefined,
  receiptLogo: undefined,
  receiptShowLogo: false,
  primaryHue: 30,
  primarySaturation: 95,
  primaryLightness: 55,
  backgroundHue: 220,
  backgroundSaturation: 20,
  backgroundLightness: 10,
  mpesaNumber: '',
  mpesaName: '',
  emolaNumber: '',
  bankName: '',
  bankAccount: '',
  bankIban: '',
  bankHolder: '',
  taxId: '',
  address: '',
  phone: '',
};

// In-memory cache mirrors localStorage for O(1) sync reads.
let cache: AppSettings = readLocalCache();

function readLocalCache(): AppSettings {
  try {
    const raw = localStorage.getItem(CACHE_KEY());
    if (!raw) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function writeLocalCache(s: AppSettings) {
  cache = s;
  try { localStorage.setItem(CACHE_KEY(), JSON.stringify(s)); } catch { /* quota */ }
}

/** Reset da cache em memória (troca de conta / restaurante). */
export function resetSettingsCache(): void {
  cache = readLocalCache();
  applyTheme(cache);
}

/** Sync read from cache. Safe to call at boot. */
export function loadSettings(): AppSettings {
  return cache;
}

/** Sync save (updates cache + theme immediately) and fires an async upsert to Supabase. */
export function saveSettings(s: AppSettings): void {
  writeLocalCache(s);
  applyTheme(s);
  window.dispatchEvent(new CustomEvent('app-settings-changed', { detail: s }));
  const tenantId = localStorage.getItem('current_tenant_id');
  if (tenantId) {
    void cloud('app_settings')
      .upsert({ tenant_id: tenantId, data: s as never }, { onConflict: 'tenant_id' })
      .then(({ error }) => { if (error) console.warn('saveSettings upsert failed', error.message); });
  }
}

/** Fetch authoritative settings for the active tenant and hydrate the cache. */
export async function fetchSettings(tenantId: string): Promise<AppSettings> {
  const { data, error } = await supabase
    .from('app_settings')
    .select('data')
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (error) {
    console.warn('fetchSettings failed', error.message);
    return cache;
  }
  const remote = (data?.data ?? null) as Partial<AppSettings> | null;
  const merged: AppSettings = { ...DEFAULT_SETTINGS, ...(remote ?? {}) };
  writeLocalCache(merged);
  void warmStorageUrls(LOGO_BUCKET, [merged.iconUrl, merged.receiptLogo]);
  applyTheme(merged);
  window.dispatchEvent(new CustomEvent('app-settings-changed', { detail: merged }));
  return merged;
}

export function applyTheme(s: AppSettings): void {
  const root = document.documentElement;
  const p = `${s.primaryHue} ${s.primarySaturation}% ${s.primaryLightness}%`;
  const bg = `${s.backgroundHue} ${s.backgroundSaturation}% ${s.backgroundLightness}%`;
  root.style.setProperty('--primary', p);
  root.style.setProperty('--accent', p);
  root.style.setProperty('--ring', p);
  root.style.setProperty('--sidebar-primary', p);
  root.style.setProperty('--sidebar-ring', p);
  root.style.setProperty('--background', bg);
  const sidebarL = Math.max(0, s.backgroundLightness - 2);
  root.style.setProperty('--sidebar-background', `${s.backgroundHue} ${s.backgroundSaturation}% ${sidebarL}%`);
}
