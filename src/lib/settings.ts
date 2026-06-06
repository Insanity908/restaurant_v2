export interface AppSettings {
  brandName: string;
  iconEmoji: string; // simple emoji icon
  iconUrl?: string; // optional uploaded icon (data URL)
  primaryHue: number; // 0-360
  primarySaturation: number; // 0-100
  primaryLightness: number; // 0-100
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

const KEY = 'app_settings_v1';

export const DEFAULT_SETTINGS: AppSettings = {
  brandName: 'SABOR DE NAMPULA',
  iconEmoji: '☕',
  iconUrl: undefined,
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

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(s: AppSettings): void {
  localStorage.setItem(KEY, JSON.stringify(s));
  applyTheme(s);
  window.dispatchEvent(new CustomEvent('app-settings-changed', { detail: s }));
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
  // Derive sidebar bg slightly darker
  const sidebarL = Math.max(0, s.backgroundLightness - 2);
  root.style.setProperty('--sidebar-background', `${s.backgroundHue} ${s.backgroundSaturation}% ${sidebarL}%`);
}
