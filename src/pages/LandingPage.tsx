import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Coffee, CreditCard, BarChart3, Users, Package, ChefHat, ShieldCheck, Check } from 'lucide-react';
import { PLANS, formatMT } from '@/lib/billing';

const FEATURES = [
  { icon: CreditCard, title: 'POS rápido', desc: 'Pagamentos, recibos e fecho de caixa otimizados para toque.' },
  { icon: ChefHat, title: 'Cozinha (KDS)', desc: 'Ecrã para a cozinha com estado de cada item em tempo real.' },
  { icon: Package, title: 'Stock e custos', desc: 'Controle ingredientes, alertas de stock baixo e margem por prato.' },
  { icon: Users, title: 'Equipa e turnos', desc: 'PINs, papéis, ponto de entrada/saída e auditoria de ações.' },
  { icon: BarChart3, title: 'Relatórios', desc: 'Vendas por período, top items, lucros — exporta CSV e PDF.' },
  { icon: ShieldCheck, title: 'Offline-first', desc: 'Funciona sem internet. Sincroniza assim que voltar a ligar.' },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      <header className="container mx-auto px-6 py-5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-lg bg-primary/15 flex items-center justify-center">
            <Coffee className="w-5 h-5 text-primary" />
          </div>
          <span className="font-heading font-bold">Sabor POS</span>
        </div>
        <nav className="flex items-center gap-2">
          <Link to="/login"><Button variant="ghost">Entrar</Button></Link>
          <Link to="/signup"><Button>Criar conta</Button></Link>
        </nav>
      </header>

      <section className="container mx-auto px-6 py-16 text-center max-w-3xl">
        <span className="inline-block text-xs font-medium px-3 py-1 rounded-full bg-primary/10 text-primary border border-primary/20 mb-4">
          POS / ERP para restaurantes — Moçambique
        </span>
        <h1 className="font-heading text-4xl md:text-5xl font-bold leading-tight">
          O sistema completo para a sua <span className="text-primary">cadeia de restaurantes</span>
        </h1>
        <p className="text-muted-foreground mt-4 text-lg">
          Mesas, cozinha, caixa, stock, equipa e relatórios — num só lugar, mesmo offline.
        </p>
        <div className="flex flex-wrap justify-center gap-3 mt-8">
          <Link to="/signup"><Button size="lg">Começar grátis (7 dias)</Button></Link>
          <Link to="/pricing"><Button size="lg" variant="outline">Ver pacotes</Button></Link>
        </div>
      </section>

      <section className="container mx-auto px-6 pb-16 grid md:grid-cols-3 gap-4">
        {FEATURES.map(f => (
          <div key={f.title} className="glass rounded-xl p-5">
            <div className="w-10 h-10 rounded-lg bg-primary/15 flex items-center justify-center mb-3">
              <f.icon className="w-5 h-5 text-primary" />
            </div>
            <h3 className="font-heading font-semibold">{f.title}</h3>
            <p className="text-sm text-muted-foreground mt-1">{f.desc}</p>
          </div>
        ))}
      </section>

      <section id="pricing" className="container mx-auto px-6 pb-20">
        <h2 className="font-heading text-3xl font-bold text-center mb-2">Pacotes</h2>
        <p className="text-center text-muted-foreground mb-10">Escolha o plano que melhor se adapta ao seu negócio.</p>
        <div className="grid md:grid-cols-3 gap-4 max-w-4xl mx-auto">
          {(Object.keys(PLANS) as Array<keyof typeof PLANS>).map(key => {
            const p = PLANS[key];
            const highlight = key === 'semiannual';
            return (
              <div key={key} className={`glass-strong rounded-2xl p-6 flex flex-col ${highlight ? 'border-2 border-primary' : ''}`}>
                {highlight && <span className="text-xs text-primary font-medium mb-2">MAIS POPULAR</span>}
                <h3 className="font-heading text-xl font-bold">{p.label}</h3>
                <div className="mt-3">
                  <span className="font-heading text-4xl font-bold">{formatMT(p.price)}</span>
                  <span className="text-muted-foreground text-sm"> / {p.months} meses</span>
                </div>
                {p.savings && <span className="text-xs text-success mt-1">{p.savings}</span>}
                <ul className="mt-5 space-y-2 text-sm flex-1">
                  <li className="flex gap-2"><Check className="w-4 h-4 text-success" /> Utilizadores ilimitados</li>
                  <li className="flex gap-2"><Check className="w-4 h-4 text-success" /> POS, KDS, stock, relatórios</li>
                  <li className="flex gap-2"><Check className="w-4 h-4 text-success" /> Offline-first</li>
                  <li className="flex gap-2"><Check className="w-4 h-4 text-success" /> Suporte por email</li>
                </ul>
                <Link to="/signup" className="mt-6"><Button className="w-full">Começar</Button></Link>
              </div>
            );
          })}
        </div>
      </section>

      <footer className="border-t border-border/40 py-6 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} Sabor POS — Todos os direitos reservados.
      </footer>
    </div>
  );
}
