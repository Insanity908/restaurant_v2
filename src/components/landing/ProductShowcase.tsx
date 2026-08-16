import { Coffee, UtensilsCrossed, ChefHat, CreditCard, DollarSign, ShoppingBag, Clock, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Maquetas fiéis ao design real da app (mesmas classes/tokens usados nas
 * páginas reais: glass, font-heading, --primary/--success/--card) em vez de
 * screenshots reais — não depende de sessão autenticada nem de dados de um
 * restaurante real, e mostra sempre o layout actual mesmo que a app mude.
 */

function BrowserFrame({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('rounded-2xl overflow-hidden border border-border/60 bg-card shadow-2xl shadow-primary/10', className)}>
      <div className="flex items-center gap-1.5 px-3 py-2.5 bg-secondary/50 border-b border-border/60">
        <span className="w-2.5 h-2.5 rounded-full bg-destructive/50" />
        <span className="w-2.5 h-2.5 rounded-full bg-warning/50" />
        <span className="w-2.5 h-2.5 rounded-full bg-success/50" />
        <span className="ml-2 text-[10px] text-muted-foreground font-medium truncate">{title}</span>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function PhoneFrame({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('w-44 rounded-[1.75rem] border-[6px] border-card bg-card shadow-2xl shadow-primary/20 overflow-hidden ring-1 ring-border/60', className)}>
      <div className="p-2.5 min-h-[9.5rem]">{children}</div>
      <div className="flex items-stretch justify-around px-1 pt-1.5 pb-2 border-t border-border/60 bg-secondary/40">
        {[Coffee, UtensilsCrossed, ChefHat, CreditCard].map((Icon, i) => (
          <Icon key={i} className={cn('w-3.5 h-3.5', i === 3 ? 'text-primary' : 'text-muted-foreground')} />
        ))}
      </div>
    </div>
  );
}

function StatTile({ icon: Icon, label, value, tone = 'text-foreground' }: { icon: typeof DollarSign; label: string; value: string; tone?: string }) {
  return (
    <div className="glass rounded-lg p-2.5">
      <div className="flex items-center gap-1.5 text-[9px] text-muted-foreground">
        <Icon className="w-3 h-3" />{label}
      </div>
      <p className={cn('font-heading font-bold text-sm mt-0.5', tone)}>{value}</p>
    </div>
  );
}

function OrderRow({ table, items, total, tone }: { table: string; items: string; total: string; tone: string }) {
  return (
    <div className="flex items-center justify-between text-[10px] py-1 border-b border-border/30 last:border-0">
      <div className="min-w-0">
        <p className="font-medium">{table}</p>
        <p className="text-muted-foreground truncate">{items}</p>
      </div>
      <div className="text-right shrink-0 pl-2">
        <p className="font-medium">{total}</p>
        <p className={tone}>●</p>
      </div>
    </div>
  );
}

export function DashboardMockup() {
  return (
    <div className="space-y-2.5 text-[10px]">
      <div className="grid grid-cols-2 gap-2">
        <StatTile icon={DollarSign} label="Receita Total" value="42.850 MT" tone="text-success" />
        <StatTile icon={ShoppingBag} label="Pedidos Completos" value="128" />
        <StatTile icon={Clock} label="Pedidos Activos" value="6" tone="text-primary" />
        <StatTile icon={TrendingUp} label="Mesas Ocupadas" value="9/14" />
      </div>
      <div className="glass rounded-lg p-2.5">
        <p className="text-[9px] font-semibold text-muted-foreground mb-1.5">PEDIDOS RECENTES</p>
        <OrderRow table="Mesa 5" items="2x Frango Grelhado" total="700 MT" tone="text-primary" />
        <OrderRow table="Mesa 2" items="1x Pizza Pepperoni" total="500 MT" tone="text-success" />
        <OrderRow table="Take-away #12" items="1x Combo Executivo" total="380 MT" tone="text-success" />
      </div>
    </div>
  );
}

export function POSMockup() {
  return (
    <div className="grid grid-cols-5 gap-2.5 text-[10px]">
      <div className="col-span-2 space-y-1.5">
        {[{ n: 'Mesa 5', d: '3 itens · 990 MT', active: true }, { n: 'Mesa 8', d: '2 itens · 640 MT' }, { n: 'Balcão #3', d: '1 item · 250 MT' }].map(t => (
          <div key={t.n} className={cn('rounded-lg px-2 py-1.5 border', t.active ? 'border-primary bg-primary/10' : 'border-border/60')}>
            <p className="font-medium">{t.n}</p>
            <p className="text-muted-foreground text-[9px]">{t.d}</p>
          </div>
        ))}
      </div>
      <div className="col-span-3 glass rounded-lg p-2.5 flex flex-col">
        <p className="font-semibold mb-1.5">Mesa 5</p>
        <div className="space-y-1 flex-1">
          <div className="flex justify-between"><span>2x Frango Grelhado</span><span>700 MT</span></div>
          <div className="flex justify-between"><span>1x Refrigerante</span><span>90 MT</span></div>
          <div className="flex justify-between"><span>2x Arroz</span><span>200 MT</span></div>
        </div>
        <div className="border-t border-border/60 mt-1.5 pt-1.5 flex justify-between font-semibold text-primary">
          <span className="text-foreground">Total</span><span>990 MT</span>
        </div>
        <div className="mt-1.5 w-full rounded-md bg-primary text-primary-foreground text-center py-1 font-medium">
          Confirmar pagamento
        </div>
      </div>
    </div>
  );
}

export function KitchenMockup() {
  const cols: { label: string; tone: string; items: string[] }[] = [
    { label: 'PENDENTE', tone: 'text-muted-foreground', items: ['Frango Grelhado', 'Salada Caesar'] },
    { label: 'PREPARANDO', tone: 'text-primary', items: ['Pizza Pepperoni'] },
    { label: 'PRONTO', tone: 'text-success', items: ['Arroz de Marisco'] },
  ];
  return (
    <div className="grid grid-cols-3 gap-2 text-[10px]">
      {cols.map(c => (
        <div key={c.label} className="space-y-1.5">
          <p className={cn('font-semibold text-[9px]', c.tone)}>{c.label}</p>
          {c.items.map(i => (
            <div key={i} className="glass rounded-lg p-1.5">
              <p className="font-medium leading-tight">{i}</p>
              <p className="text-muted-foreground text-[9px]">Mesa 5</p>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

export function MobileNavPreview() {
  return (
    <div className="space-y-2 text-[10px]">
      <div className="glass rounded-lg p-2">
        <p className="text-[9px] text-muted-foreground">Receita Total</p>
        <p className="font-heading font-bold text-success">42.850 MT</p>
      </div>
      <div className="glass rounded-lg p-2 space-y-1">
        <div className="flex justify-between"><span>Mesa 5</span><span className="text-primary">Activo</span></div>
        <div className="flex justify-between"><span>Mesa 2</span><span className="text-success">Servido</span></div>
      </div>
    </div>
  );
}

/** Composição principal do hero: um "browser" do Dashboard com um telemóvel a sobrepor. */
export function HeroShowcase() {
  return (
    <div className="relative mx-auto max-w-md lg:max-w-none">
      <div className="absolute -inset-8 bg-primary/10 blur-3xl rounded-full -z-10" />
      <BrowserFrame title="app.saborpos.mz — Dashboard" className="rotate-[-1.5deg]">
        <DashboardMockup />
      </BrowserFrame>
      <PhoneFrame className="absolute -bottom-8 -right-4 sm:-right-8 rotate-[3deg] hidden sm:block">
        <MobileNavPreview />
      </PhoneFrame>
    </div>
  );
}

export function ProductShowcaseSection() {
  return (
    <section className="container mx-auto px-6 pb-16">
      <div className="text-center max-w-2xl mx-auto mb-8">
        <h2 className="font-heading text-3xl font-bold">Veja por dentro</h2>
        <p className="text-muted-foreground mt-2">O mesmo design em toda a operação — da cozinha ao caixa.</p>
      </div>
      <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">
        <div>
          <BrowserFrame title="Caixa">
            <POSMockup />
          </BrowserFrame>
          <p className="text-center text-sm text-muted-foreground mt-3">Caixa rápido, pensado para toque</p>
        </div>
        <div>
          <BrowserFrame title="Cozinha (KDS)">
            <KitchenMockup />
          </BrowserFrame>
          <p className="text-center text-sm text-muted-foreground mt-3">Cozinha sempre sincronizada em tempo real</p>
        </div>
      </div>
    </section>
  );
}
