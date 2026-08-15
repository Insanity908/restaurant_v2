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

export interface ThemeTokens {
  background: string; foreground: string;
  card: string; cardForeground: string;
  muted: string; mutedForeground: string;
  secondary: string; secondaryForeground: string;
  border: string;
  primary: string; primaryForeground: string;
  sidebarBackground: string; sidebarAccent: string;
}

const clampPct = (n: number) => Math.min(100, Math.max(0, n));

/** HSL (0-360, 0-100, 0-100) -> sRGB channels in 0..1. */
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const S = s / 100, L = l / 100;
  const c = (1 - Math.abs(2 * L - 1)) * S;
  const hp = h / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const [r1, g1, b1] =
    hp < 1 ? [c, x, 0] : hp < 2 ? [x, c, 0] : hp < 3 ? [0, c, x] :
    hp < 4 ? [0, x, c] : hp < 5 ? [x, 0, c] : [c, 0, x];
  const m = L - c / 2;
  return [r1 + m, g1 + m, b1 + m];
}

/** WCAG relative luminance of an HSL color. */
function relativeLuminance(h: number, s: number, l: number): number {
  const lin = (v: number) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  const [r, g, b] = hslToRgb(h, s, l);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/**
 * Escolhe texto branco ou quase-preto conforme o que dá mais contraste real
 * (fórmula de contraste WCAG) contra uma cor HSL arbitrária — matiz e
 * saturação mudam o brilho percebido tanto quanto a luminosidade (ex:
 * amarelo a 50% de luminosidade é bem mais claro que azul a 50%), por isso
 * decidir só pela luminosidade (como uma versão anterior fazia) dava texto
 * ilegível em várias combinações de cor primária.
 */
function pickForeground(h: number, s: number, l: number): string {
  const L = relativeLuminance(h, s, l);
  const contrastWithWhite = 1.05 / (L + 0.05);
  const contrastWithBlack = (L + 0.05) / 0.05;
  return contrastWithWhite >= contrastWithBlack ? '0 0% 100%' : '0 0% 10%';
}

/**
 * Deriva TODOS os tokens de cor a partir só de matiz/saturação/luminosidade
 * escolhidos (não só --background e --primary, como fazia antes) — sem
 * isto, texto/cartões/bordas ficavam sempre fixos no cinza-azulado escuro
 * original em index.css, e qualquer fundo claro (ex: preset "Claro") saía
 * com texto quase-branco sobre fundo quase-branco, ilegível. Usado tanto
 * para aplicar o tema real (applyTheme) como para a pré-visualização ao
 * vivo em SettingsPage, para as duas nunca poderem divergir.
 */
export function deriveThemeTokens(s: AppSettings): ThemeTokens {
  const { primaryHue: ph, primarySaturation: ps, primaryLightness: pl } = s;
  const { backgroundHue: bh, backgroundSaturation: bs, backgroundLightness: bl } = s;
  const isLight = bl >= 50;

  const primaryForeground = pickForeground(ph, ps, pl);

  // Texto principal — baixa saturação (não compete com a cor de marca),
  // sempre no extremo oposto do fundo para garantir contraste alto.
  const foreground = isLight ? `${bh} 15% 15%` : `${bh} 20% 95%`;
  const mutedForeground = isLight ? `${bh} 10% 40%` : `${bh} 12% 60%`;

  // Superfícies (cartões, secundário, bordas) — deslocam-se a partir do
  // fundo na mesma matiz/saturação escolhida, em vez de ficarem sempre
  // cinza-azulado fixo, para ficarem coerentes com a cor de fundo escolhida.
  const toward = (delta: number) => clampPct(isLight ? bl - delta : bl + delta);
  const sat = (delta: number) => Math.max(0, bs - delta);

  return {
    background: `${bh} ${bs}% ${bl}%`,
    foreground,
    card: `${bh} ${bs}% ${toward(4)}%`,
    cardForeground: foreground,
    muted: `${bh} ${sat(5)}% ${toward(7)}%`,
    mutedForeground,
    secondary: `${bh} ${sat(3)}% ${toward(9)}%`,
    secondaryForeground: foreground,
    border: `${bh} ${bs}% ${toward(isLight ? 16 : 10)}%`,
    primary: `${ph} ${ps}% ${pl}%`,
    primaryForeground,
    sidebarBackground: `${bh} ${bs}% ${clampPct(isLight ? bl - 3 : bl - 2)}%`,
    sidebarAccent: `${bh} ${sat(5)}% ${toward(6)}%`,
  };
}

export function applyTheme(s: AppSettings): void {
  const root = document.documentElement;
  const t = deriveThemeTokens(s);
  root.style.setProperty('--background', t.background);
  root.style.setProperty('--foreground', t.foreground);
  root.style.setProperty('--card', t.card);
  root.style.setProperty('--card-foreground', t.cardForeground);
  root.style.setProperty('--popover', t.card);
  root.style.setProperty('--popover-foreground', t.cardForeground);
  root.style.setProperty('--muted', t.muted);
  root.style.setProperty('--muted-foreground', t.mutedForeground);
  root.style.setProperty('--secondary', t.secondary);
  root.style.setProperty('--secondary-foreground', t.secondaryForeground);
  root.style.setProperty('--border', t.border);
  root.style.setProperty('--input', t.border);
  root.style.setProperty('--primary', t.primary);
  root.style.setProperty('--primary-foreground', t.primaryForeground);
  root.style.setProperty('--accent', t.primary);
  root.style.setProperty('--accent-foreground', t.primaryForeground);
  root.style.setProperty('--ring', t.primary);
  root.style.setProperty('--sidebar-background', t.sidebarBackground);
  root.style.setProperty('--sidebar-foreground', t.foreground);
  root.style.setProperty('--sidebar-accent', t.sidebarAccent);
  root.style.setProperty('--sidebar-accent-foreground', t.foreground);
  root.style.setProperty('--sidebar-border', t.border);
  root.style.setProperty('--sidebar-primary', t.primary);
  root.style.setProperty('--sidebar-primary-foreground', t.primaryForeground);
  root.style.setProperty('--sidebar-ring', t.primary);
}
