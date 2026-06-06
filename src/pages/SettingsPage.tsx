import { useMemo, useRef, useState } from 'react';
import PageShell from '@/components/PageShell';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Slider } from '@/components/ui/slider';
import { useSettings } from '@/hooks/useSettings';
import { Upload, RotateCcw, Save, Palette, Building2, Smartphone, Image as ImageIcon, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import {
  maskMzPhone, maskIntlPhone, maskBankAccount, maskIban, maskNuit,
  validateMpesa, validateEmola, validateBankAccount, validateIban, validateNuit, validateIntlPhone,
} from '@/lib/validators';

const EMOJI_CHOICES = ['☕', '🍴', '🍕', '🍔', '🍲', '🥘', '🍜', '🌮', '🍱', '🥗', '🍳', '🔥', '⭐', '🏪'];

export default function SettingsPage() {
  const { settings, update, reset } = useSettings();
  const [local, setLocal] = useState(settings);
  const fileRef = useRef<HTMLInputElement>(null);

  const set = <K extends keyof typeof local>(k: K, v: typeof local[K]) =>
    setLocal(prev => ({ ...prev, [k]: v }));

  const errors = useMemo(() => ({
    mpesaNumber: validateMpesa(local.mpesaNumber),
    emolaNumber: validateEmola(local.emolaNumber),
    bankAccount: validateBankAccount(local.bankAccount),
    bankIban: validateIban(local.bankIban),
    taxId: validateNuit(local.taxId),
    phone: validateIntlPhone(local.phone),
  }), [local]);

  const hasErrors = Object.values(errors).some(Boolean);

  const save = () => {
    if (hasErrors) {
      toast.error('Corrija os campos inválidos antes de guardar');
      return;
    }
    update(local);
    toast.success('Configurações guardadas');
  };

  const handleIconUpload = (file: File) => {
    if (file.size > 500 * 1024) {
      toast.error('Imagem muito grande (máx 500KB)');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => set('iconUrl', reader.result as string);
    reader.readAsDataURL(file);
  };

  const primaryPreview = `hsl(${local.primaryHue} ${local.primarySaturation}% ${local.primaryLightness}%)`;
  const bgPreview = `hsl(${local.backgroundHue} ${local.backgroundSaturation}% ${local.backgroundLightness}%)`;

  return (
    <PageShell
      title="Configurações"
      subtitle="Personalize a marca, cores e métodos de pagamento"
      actions={
        <>
          <Button variant="outline" onClick={() => { reset(); setLocal(settings); toast.success('Restaurado'); }}>
            <RotateCcw className="w-4 h-4" /> Restaurar
          </Button>
          <Button onClick={save} disabled={hasErrors}>
            <Save className="w-4 h-4" /> Guardar
          </Button>
        </>
      }
    >
      <Tabs defaultValue="brand" className="space-y-6">
        <TabsList className="grid grid-cols-2 lg:grid-cols-4 w-full lg:w-auto">
          <TabsTrigger value="brand"><ImageIcon className="w-4 h-4 mr-2" />Marca</TabsTrigger>
          <TabsTrigger value="theme"><Palette className="w-4 h-4 mr-2" />Aparência</TabsTrigger>
          <TabsTrigger value="payments"><Smartphone className="w-4 h-4 mr-2" />Pagamentos</TabsTrigger>
          <TabsTrigger value="business"><Building2 className="w-4 h-4 mr-2" />Negócio</TabsTrigger>
        </TabsList>

        {/* BRAND */}
        <TabsContent value="brand" className="space-y-4">
          <Card className="p-6 space-y-5">
            <h2 className="font-heading text-lg font-semibold">Identidade visual</h2>
            <div className="space-y-2">
              <Label>Nome do estabelecimento</Label>
              <Input
                value={local.brandName}
                onChange={e => set('brandName', e.target.value)}
                placeholder="SABOR DE NAMPULA"
              />
              <p className="text-xs text-muted-foreground">Use quebra de linha para dividir em duas linhas no menu lateral.</p>
            </div>

            <div className="space-y-2">
              <Label>Ícone (emoji)</Label>
              <div className="flex flex-wrap gap-2">
                {EMOJI_CHOICES.map(e => (
                  <button
                    key={e}
                    type="button"
                    onClick={() => { set('iconEmoji', e); set('iconUrl', undefined); }}
                    className={`w-11 h-11 rounded-lg flex items-center justify-center text-2xl border transition ${
                      local.iconEmoji === e && !local.iconUrl ? 'border-primary bg-primary/10' : 'border-border hover:bg-secondary'
                    }`}
                  >{e}</button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Ou carregar imagem (logo)</Label>
              <div className="flex items-center gap-3">
                {local.iconUrl && (
                  <img src={local.iconUrl} alt="logo" className="w-14 h-14 rounded-lg object-cover border border-border" />
                )}
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={e => e.target.files?.[0] && handleIconUpload(e.target.files[0])}
                />
                <Button type="button" variant="outline" onClick={() => fileRef.current?.click()}>
                  <Upload className="w-4 h-4" /> Carregar
                </Button>
                {local.iconUrl && (
                  <Button type="button" variant="ghost" onClick={() => set('iconUrl', undefined)}>Remover</Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">PNG/JPG quadrado, até 500KB.</p>
            </div>
          </Card>
        </TabsContent>

        {/* THEME */}
        <TabsContent value="theme" className="space-y-4">
          <Card className="p-6 space-y-6">
            <h2 className="font-heading text-lg font-semibold">Cores</h2>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label>Cor primária</Label>
                <div className="w-10 h-10 rounded-lg border border-border" style={{ background: primaryPreview }} />
              </div>
              <SliderRow label="Matiz" value={local.primaryHue} min={0} max={360}
                onChange={v => set('primaryHue', v)} />
              <SliderRow label="Saturação" value={local.primarySaturation} min={0} max={100}
                onChange={v => set('primarySaturation', v)} suffix="%" />
              <SliderRow label="Luminosidade" value={local.primaryLightness} min={20} max={80}
                onChange={v => set('primaryLightness', v)} suffix="%" />
            </div>

            <div className="border-t border-border pt-6 space-y-4">
              <div className="flex items-center justify-between">
                <Label>Fundo da aplicação</Label>
                <div className="w-10 h-10 rounded-lg border border-border" style={{ background: bgPreview }} />
              </div>
              <SliderRow label="Matiz" value={local.backgroundHue} min={0} max={360}
                onChange={v => set('backgroundHue', v)} />
              <SliderRow label="Saturação" value={local.backgroundSaturation} min={0} max={50}
                onChange={v => set('backgroundSaturation', v)} suffix="%" />
              <SliderRow label="Luminosidade" value={local.backgroundLightness} min={4} max={98}
                onChange={v => set('backgroundLightness', v)} suffix="%" />
            </div>

            <div className="flex flex-wrap gap-2 pt-4 border-t border-border">
              <PresetButton label="Laranja escuro" onClick={() => setLocal(p => ({ ...p, primaryHue: 30, primarySaturation: 95, primaryLightness: 55, backgroundHue: 220, backgroundSaturation: 20, backgroundLightness: 10 }))} />
              <PresetButton label="Verde escuro" onClick={() => setLocal(p => ({ ...p, primaryHue: 142, primarySaturation: 71, primaryLightness: 45, backgroundHue: 160, backgroundSaturation: 15, backgroundLightness: 9 }))} />
              <PresetButton label="Azul escuro" onClick={() => setLocal(p => ({ ...p, primaryHue: 210, primarySaturation: 90, primaryLightness: 55, backgroundHue: 220, backgroundSaturation: 25, backgroundLightness: 8 }))} />
              <PresetButton label="Roxo escuro" onClick={() => setLocal(p => ({ ...p, primaryHue: 270, primarySaturation: 80, primaryLightness: 60, backgroundHue: 260, backgroundSaturation: 20, backgroundLightness: 10 }))} />
              <PresetButton label="Claro" onClick={() => setLocal(p => ({ ...p, primaryHue: 30, primarySaturation: 95, primaryLightness: 50, backgroundHue: 30, backgroundSaturation: 20, backgroundLightness: 96 }))} />
            </div>
          </Card>
        </TabsContent>

        {/* PAYMENTS */}
        <TabsContent value="payments" className="space-y-4">
          <Card className="p-6 space-y-5">
            <h2 className="font-heading text-lg font-semibold">Carteira móvel</h2>
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Número M-Pesa" value={local.mpesaNumber}
                onChange={v => set('mpesaNumber', maskMzPhone(v))}
                placeholder="84 123 4567" error={errors.mpesaNumber}
                hint="" inputMode="numeric" />
              <Field label="Nome do titular M-Pesa" value={local.mpesaName}
                onChange={v => set('mpesaName', v)} placeholder="Nome registado" />
              <Field label="Número e-Mola" value={local.emolaNumber}
                onChange={v => set('emolaNumber', maskMzPhone(v))}
                placeholder="86 123 4567" error={errors.emolaNumber}
                hint="" inputMode="numeric" />
            </div>
          </Card>

          <Card className="p-6 space-y-5">
            <h2 className="font-heading text-lg font-semibold">Conta bancária</h2>
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Banco" value={local.bankName}
                onChange={v => set('bankName', v)} placeholder="BCI, BIM, Standard Bank..." />
              <Field label="Titular" value={local.bankHolder}
                onChange={v => set('bankHolder', v)} placeholder="Nome do titular" />
              <Field label="Número da conta" value={local.bankAccount}
                onChange={v => set('bankAccount', maskBankAccount(v))}
                placeholder="0000 0000 0000" error={errors.bankAccount}
                hint="8 a 16 dígitos" inputMode="numeric" />
              <Field label="NIB / IBAN" value={local.bankIban}
                onChange={v => set('bankIban', maskIban(v))}
                placeholder="MZ59 0001 0000 0000 0000 0000 1"
                error={errors.bankIban} hint="MZ + 23 dígitos" />
            </div>
          </Card>
        </TabsContent>

        {/* BUSINESS */}
        <TabsContent value="business" className="space-y-4">
          <Card className="p-6 space-y-5">
            <h2 className="font-heading text-lg font-semibold">Dados do negócio</h2>
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="NUIT" value={local.taxId}
                onChange={v => set('taxId', maskNuit(v))}
                placeholder="400000000" error={errors.taxId}
                hint="9 dígitos" inputMode="numeric" />
              <Field label="Telefone" value={local.phone}
                onChange={v => set('phone', maskIntlPhone(v))}
                placeholder="+258 84 123 4567" error={errors.phone} />
              <div className="sm:col-span-2">
                <Field label="Endereço" value={local.address}
                  onChange={v => set('address', v)} placeholder="Av., bairro, cidade" />
              </div>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}

function Field({ label, value, onChange, placeholder, error, hint, inputMode }: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; error?: string | null; hint?: string;
  inputMode?: 'text' | 'numeric' | 'tel' | 'email';
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        inputMode={inputMode}
        aria-invalid={!!error}
        className={error ? 'border-destructive focus-visible:ring-destructive' : ''}
      />
      {error ? (
        <p className="text-xs text-destructive flex items-center gap-1">
          <AlertCircle className="w-3 h-3" /> {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

function SliderRow({ label, value, min, max, onChange, suffix = '' }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void; suffix?: string }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono text-foreground">{value}{suffix}</span>
      </div>
      <Slider value={[value]} min={min} max={max} step={1} onValueChange={([v]) => onChange(v)} />
    </div>
  );
}

function PresetButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button type="button" variant="outline" size="sm" onClick={onClick}>{label}</Button>
  );
}
