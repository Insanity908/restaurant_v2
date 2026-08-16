import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Search, ImageOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { fetchPresetImages, type PresetImage } from '@/lib/presetImages';
import { PRESET_IMAGES_BUCKET } from '@/lib/storage';
import StorageImage from '@/components/StorageImage';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSelect: (storagePath: string) => void;
  defaultCategory?: string;
}

export default function ImagePickerDialog({ open, onOpenChange, onSelect, defaultCategory }: Props) {
  const [images, setImages] = useState<PresetImage[]>([]);
  const [loading, setLoading] = useState(false);
  const [category, setCategory] = useState<string>('Todas');
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!open) return;
    setSearch('');
    setLoading(true);
    fetchPresetImages().then(imgs => {
      setImages(imgs);
      setCategory(prev => defaultCategory ?? prev);
    }).finally(() => setLoading(false));
  }, [open, defaultCategory]);

  const categories = useMemo(() => {
    const set = new Set(images.map(i => i.category));
    return ['Todas', ...Array.from(set).sort()];
  }, [images]);

  const filtered = images
    .filter(i => category === 'Todas' || i.category === category)
    .filter(i => !search.trim() || i.label.toLowerCase().includes(search.trim().toLowerCase()));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col glass-strong border-border">
        <DialogHeader>
          <DialogTitle className="font-heading">Escolher imagem da galeria</DialogTitle>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Pesquisar..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 bg-secondary border-border"
          />
        </div>

        <div className="flex flex-wrap gap-1.5">
          {categories.map(c => (
            <button
              key={c}
              type="button"
              onClick={() => setCategory(c)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                category === c ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
              )}
            >
              {c}
            </button>
          ))}
        </div>

        <div className="overflow-y-auto flex-1 min-h-[240px]">
          {loading ? (
            <p className="text-sm text-muted-foreground text-center py-12">A carregar…</p>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
              <ImageOff className="w-8 h-8 opacity-40" />
              <p className="text-sm">Sem imagens {category !== 'Todas' ? `em "${category}"` : 'na galeria'}.</p>
            </div>
          ) : (
            <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
              {filtered.map(img => (
                <button
                  key={img.id}
                  type="button"
                  onClick={() => { onSelect(img.storagePath); onOpenChange(false); }}
                  title={img.label}
                  className="relative aspect-square rounded-lg overflow-hidden border-2 border-border hover:border-primary/50 transition-colors"
                >
                  <StorageImage bucket={PRESET_IMAGES_BUCKET} path={img.storagePath} alt={img.label} className="w-full h-full object-cover" />
                  <span className="absolute inset-x-0 bottom-0 bg-background/80 text-[10px] px-1 py-0.5 truncate">{img.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
