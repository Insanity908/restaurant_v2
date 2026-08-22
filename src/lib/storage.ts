import { supabase } from '@/integrations/supabase/client';

export const MENU_BUCKET = 'menu-images';
export const LOGO_BUCKET = 'receipt-logos';
export const PRESET_IMAGES_BUCKET = 'preset-images';

const SIGNED_TTL = 60 * 60 * 24 * 7; // 7 days
const CACHE_KEY = 'storage_signed_urls_v1';

type CacheEntry = { url: string; exp: number };
const cache: Record<string, CacheEntry> = readCache();

function readCache(): Record<string, CacheEntry> {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function writeCache() {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(cache)); } catch { /* quota */ }
}

function key(bucket: string, path: string) { return `${bucket}/${path}`; }

/** True when the stored value is a Storage object path (not a data/blob/http URL). */
export function isStoragePath(value?: string | null): value is string {
  if (!value) return false;
  return !/^(data:|blob:|https?:|\/)/i.test(value);
}

/** Sync read of a previously resolved signed URL (empty string when unknown). */
export function getCachedUrl(bucket: string, path: string): string {
  const entry = cache[key(bucket, path)];
  if (entry && entry.exp > Date.now()) return entry.url;
  return '';
}

/** Resolve (and cache) a signed URL for a storage object path. */
export async function resolveStorageUrl(bucket: string, path: string): Promise<string> {
  const cached = getCachedUrl(bucket, path);
  if (cached) return cached;
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, SIGNED_TTL);
  if (error || !data?.signedUrl) {
    console.warn(`[storage] signed url failed for ${bucket}/${path}: ${error?.message}`);
    return '';
  }
  cache[key(bucket, path)] = { url: data.signedUrl, exp: Date.now() + (SIGNED_TTL - 3600) * 1000 };
  writeCache();
  return data.signedUrl;
}

/** Pre-resolve several paths at once (used after hydrating the catalog/settings). */
export async function warmStorageUrls(bucket: string, paths: (string | undefined | null)[]): Promise<void> {
  const pending = Array.from(new Set(paths.filter(isStoragePath))).filter(p => !getCachedUrl(bucket, p));
  if (!pending.length) return;
  const { data, error } = await supabase.storage.from(bucket).createSignedUrls(pending, SIGNED_TTL);
  if (error || !data) { console.warn(`[storage] batch sign failed: ${error?.message}`); return; }
  const exp = Date.now() + (SIGNED_TTL - 3600) * 1000;
  data.forEach(entry => {
    if (entry.signedUrl && entry.path) cache[key(bucket, entry.path)] = { url: entry.signedUrl, exp };
  });
  writeCache();
}

function extOf(file: File): string {
  const fromName = file.name.includes('.') ? file.name.split('.').pop()!.toLowerCase() : '';
  if (fromName) return fromName;
  return (file.type.split('/')[1] || 'jpg').toLowerCase();
}

/** Upload an image into a tenant-scoped folder. Returns the storage object path. */
export async function uploadTenantImage(bucket: string, file: File): Promise<string> {
  const tenantId = localStorage.getItem('current_tenant_id');
  if (!tenantId) throw new Error('Nenhum restaurante activo');
  const path = `${tenantId}/${crypto.randomUUID()}.${extOf(file)}`;
  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    cacheControl: '3600',
    contentType: file.type || 'image/jpeg',
    upsert: false,
  });
  if (error) throw new Error(error.message);
  await resolveStorageUrl(bucket, path);
  return path;
}

/** Upload into a global (non-tenant) folder — used for the superadmin-managed preset image library. */
export async function uploadGlobalImage(bucket: string, folder: string, file: File): Promise<string> {
  const path = `${folder}/${crypto.randomUUID()}.${extOf(file)}`;
  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    cacheControl: '3600',
    contentType: file.type || 'image/jpeg',
    upsert: false,
  });
  if (error) throw new Error(error.message);
  await resolveStorageUrl(bucket, path);
  return path;
}

/** Best-effort removal of an object that is no longer referenced. */
export async function removeStorageObject(bucket: string, path?: string | null): Promise<void> {
  if (!isStoragePath(path)) return;
  const { error } = await supabase.storage.from(bucket).remove([path]);
  if (error) console.warn(`[storage] remove failed: ${error.message}`);
  delete cache[key(bucket, path)];
  writeCache();
}

export interface StorageUsage {
  buckets: Record<string, number>;
  databaseBytes: number;
}

/** Superadmin-only: bytes used per Storage bucket, plus Postgres database size. */
export async function fetchStorageUsage(): Promise<StorageUsage> {
  const { data, error } = await supabase.rpc('get_storage_usage');
  if (error) throw new Error(error.message);
  return data as StorageUsage;
}
