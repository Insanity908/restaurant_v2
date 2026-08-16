/**
 * Biblioteca global de imagens padrão gerida pelo superadmin — usada pelo
 * seletor de imagens no Menu e no Inventário. Substitui os presets
 * estáticos que antes vinham embutidos em src/assets/menu-presets.
 */
import { supabase } from '@/integrations/supabase/client';
import { uploadGlobalImage, removeStorageObject, PRESET_IMAGES_BUCKET } from './storage';

export interface PresetImage {
  id: string;
  category: string;
  label: string;
  storagePath: string;
}

type Row = { id: string; category: string; label: string; storage_path: string };

function mapRow(r: Row): PresetImage {
  return { id: r.id, category: r.category, label: r.label, storagePath: r.storage_path };
}

function slugify(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'geral';
}

/** Everyone (any authenticated user) reads the whole library. */
export async function fetchPresetImages(): Promise<PresetImage[]> {
  const { data, error } = await supabase
    .from('preset_images')
    .select('id, category, label, storage_path')
    .order('category', { ascending: true });
  if (error) { console.warn('fetchPresetImages failed', error.message); return []; }
  return (data as Row[]).map(mapRow);
}

/** Superadmin only (enforced by RLS) — uploads the file and records it. */
export async function uploadPresetImage(file: File, category: string, label: string): Promise<boolean> {
  try {
    const path = await uploadGlobalImage(PRESET_IMAGES_BUCKET, slugify(category), file);
    const { error } = await supabase.from('preset_images').insert({
      category: category.trim(),
      label: label.trim(),
      storage_path: path,
    });
    if (error) { console.warn('uploadPresetImage failed', error.message); return false; }
    return true;
  } catch (err) {
    console.warn('uploadPresetImage failed', (err as Error).message);
    return false;
  }
}

/** Superadmin only (enforced by RLS) — removes the object and its row. */
export async function deletePresetImage(id: string, storagePath: string): Promise<boolean> {
  const { error } = await supabase.from('preset_images').delete().eq('id', id);
  if (error) { console.warn('deletePresetImage failed', error.message); return false; }
  await removeStorageObject(PRESET_IMAGES_BUCKET, storagePath);
  return true;
}
