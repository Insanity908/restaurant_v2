import { useEffect, useState } from 'react';
import { getCachedUrl, isStoragePath, resolveStorageUrl } from '@/lib/storage';

/**
 * Resolve an image value that may be either a plain URL / data URL (legacy)
 * or a Supabase Storage object path (current format).
 */
export function useStorageImage(bucket: string, value?: string | null): string | undefined {
  const [url, setUrl] = useState<string | undefined>(() =>
    isStoragePath(value) ? getCachedUrl(bucket, value) || undefined : value ?? undefined,
  );

  useEffect(() => {
    let active = true;
    if (!value) { setUrl(undefined); return; }
    if (!isStoragePath(value)) { setUrl(value); return; }
    const cached = getCachedUrl(bucket, value);
    if (cached) { setUrl(cached); return; }
    setUrl(undefined);
    void resolveStorageUrl(bucket, value).then(resolved => {
      if (active && resolved) setUrl(resolved);
    });
    return () => { active = false; };
  }, [bucket, value]);

  return url;
}
