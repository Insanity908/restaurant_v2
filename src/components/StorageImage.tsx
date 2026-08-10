import { useStorageImage } from '@/hooks/useStorageImage';

interface Props {
  bucket: string;
  path?: string | null;
  fallbackSrc?: string;
  alt: string;
  className?: string;
  placeholder?: React.ReactNode;
  loading?: 'lazy' | 'eager';
}

/** Renders an image stored either in Supabase Storage (object path) or a plain URL. */
export default function StorageImage({ bucket, path, fallbackSrc, alt, className, placeholder, loading = 'lazy' }: Props) {
  const resolved = useStorageImage(bucket, path);
  const src = resolved || fallbackSrc;
  if (!src) return <>{placeholder ?? null}</>;
  return <img src={src} alt={alt} className={className} loading={loading} />;
}
