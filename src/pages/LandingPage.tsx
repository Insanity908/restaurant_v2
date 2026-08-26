import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Coffee, CreditCard, BarChart3, Users, Package, ChefHat, ShieldCheck, Check } from 'lucide-react';
import { PLANS, formatMT, fetchPlans, BASIC_PLANS, PRO_PLANS } from '@/lib/billing';
import InstallAppButton from '@/components/InstallAppButton';
import { HeroShowcase, ProductShowcaseSection } from '@/components/landing/ProductShowcase';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';

const FAQS = [
  {
    q: 'Preciso de internet para usar o sistema?',
    a: 'Não. O Sabor POS funciona offline-first: os pedidos, o cardápio e o caixa continuam a funcionar sem ligação, e tudo sincroniza automaticamente assim que a internet voltar.',
  },
  {
    q: 'Como funciona o pagamento da subscrição?',
    a: 'O pagamento é manual, por M-Pesa, e-Mola ou transferência bancária. Depois de pagar, envia o comprovativo e a sua conta é activada em pouco tempo — sem precisar de cartão de crédito.',
  },
  {
    q: 'Posso experimentar antes de pagar?',
    a: 'Sim — ao criar conta tem 7 dias grátis com acesso total às funcionalidades do plano Profissional, sem precisar de indicar nenhum método de pagamento.',
  },
  {
    q: 'Quantos restaurantes/mesas/funcionários posso ter?',
    a: 'No plano Profissional não há limites de mesas nem de equipa. O plano Básico tem um limite de 10 mesas e 5 funcionários — pode migrar para o Profissional a qualquer momento.',
  },
  {
    q: 'Os meus dados ficam seguros?',
    a: 'Sim. Cada restaurante só acede aos seus próprios dados, e o acesso da equipa é controlado por papel (administrador, gerente, caixa, garçom, cozinha). Veja mais na nossa Política de Privacidade.',
  },
];

const FEATURES = [
  { icon: CreditCard, title: 'POS rápido', desc: 'Pagamentos, recibos e fecho de caixa otimizados para toque.' },
  { icon: ChefHat, title: 'Cozinha (KDS)', desc: 'Ecrã para a cozinha com estado de cada item em tempo real.' },
  { icon: Package, title: 'Stock e custos', desc: 'Controle ingredientes, alertas de stock baixo e margem por prato.' },
  { icon: Users, title: 'Equipa e turnos', desc: 'Papéis, ponto de entrada/saída e auditoria de ações.' },
  { icon: BarChart3, title: 'Relatórios', desc: 'Vendas por período, top items, lucros — exporta CSV e PDF.' },
  { icon: ShieldCheck, title: 'Offline-first', desc: 'Funciona sem internet. Sincroniza assim que voltar a ligar.' },
];

export default function LandingPage() {
  const [, forceRefresh] = useState(0);
  useEffect(() => { fetchPlans().then(() => forceRefresh(v => v + 1)).catch(() => { /* keep defaults */ }); }, []);

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

      <section className="container mx-auto px-6 py-12 lg:py-16 grid lg:grid-cols-2 gap-12 lg:gap-8 items-center">
        <div className="text-center lg:text-left max-w-xl mx-auto lg:mx-0">
          <span className="inline-block text-xs font-medium px-3 py-1 rounded-full bg-primary/10 text-primary border border-primary/20 mb-4">
            POS / ERP para restaurantes — Moçambique
          </span>
          <h1 className="font-heading text-4xl md:text-5xl font-bold leading-tight">
            O sistema completo para a sua <span className="text-primary">cadeia de restaurantes</span>
          </h1>
          <p className="text-muted-foreground mt-4 text-lg">
            Mesas, cozinha, caixa, stock, equipa e relatórios — num só lugar, mesmo offline.
          </p>
          <div className="flex flex-wrap justify-center lg:justify-start gap-3 mt-8">
            <Link to="/signup"><Button size="lg">Começar grátis (7 dias)</Button></Link>
            <a href="#pricing"><Button size="lg" variant="outline">Ver pacotes</Button></a>
            <InstallAppButton variant="cta" />
          </div>
        </div>
        <div className="pt-4 lg:pt-0">
          <HeroShowcase />
        </div>
      </section>

      <ProductShowcaseSection />

      <section className="container mx-auto px-6 pb-16">
        <div className="text-center max-w-2xl mx-auto mb-8">
          <h2 className="font-heading text-3xl font-bold">Tudo o que precisa, num só sistema</h2>
          <p className="text-muted-foreground mt-2">Sem depender de vários apps nem de internet estável.</p>
        </div>
        <div className="grid md:grid-cols-3 gap-4">
        {FEATURES.map(f => (
          <div key={f.title} className="glass rounded-xl p-5">
            <div className="w-10 h-10 rounded-lg bg-primary/15 flex items-center justify-center mb-3">
              <f.icon className="w-5 h-5 text-primary" />
            </div>
            <h3 className="font-heading font-semibold">{f.title}</h3>
            <p className="text-sm text-muted-foreground mt-1">{f.desc}</p>
          </div>
        ))}
        </div>
      </section>

      <section id="pricing" className="container mx-auto px-6 pb-20">
        <h2 className="font-heading text-3xl font-bold text-center mb-2">Pacotes</h2>
        <p className="text-center text-muted-foreground mb-10">Escolha o plano que melhor se adapta ao seu negócio.</p>
        {([{ label: 'Básico', plans: BASIC_PLANS }, { label: 'Profissional', plans: PRO_PLANS }] as const).map(({ label, plans }) => (
          <div key={label} className="mb-10 last:mb-0">
            <h3 className="font-heading text-lg font-semibold text-center mb-4">{label}</h3>
            <div className="grid md:grid-cols-4 gap-4 max-w-6xl mx-auto">
              {plans.map(key => {
                const p = PLANS[key];
                const highlight = label === 'Profissional' && key === 'quarterly';
                return (
                  <div key={key} className={`glass-strong rounded-2xl p-6 flex flex-col ${highlight ? 'border-2 border-primary' : ''}`}>
                    {highlight && <span className="text-xs text-primary font-medium mb-2">MAIS POPULAR</span>}
                    <h4 className="font-heading text-xl font-bold">{p.label}</h4>
                    <div className="mt-3">
                      <span className="font-heading text-4xl font-bold">{formatMT(p.price)}</span>
                      <span className="text-muted-foreground text-sm"> / {p.months} meses</span>
                    </div>
                    {p.savings && <span className="text-xs text-success mt-1">{p.savings}</span>}
                    <ul className="mt-5 space-y-2 text-sm flex-1">
                      {p.features.map(f => (
                        <li key={f} className="flex gap-2"><Check className="w-4 h-4 text-success shrink-0" /> {f}</li>
                      ))}
                    </ul>
                    <Link to="/signup" className="mt-6"><Button className="w-full">Começar</Button></Link>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </section>

      <section className="container mx-auto px-6 pb-20 max-w-2xl">
        <h2 className="font-heading text-3xl font-bold text-center mb-8">Perguntas frequentes</h2>
        <Accordion type="single" collapsible className="w-full">
          {FAQS.map((faq, i) => (
            <AccordionItem key={i} value={`faq-${i}`}>
              <AccordionTrigger className="text-left font-heading font-semibold">{faq.q}</AccordionTrigger>
              <AccordionContent className="text-muted-foreground">{faq.a}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </section>

      <footer className="border-t border-border/40 py-6 text-center text-xs text-muted-foreground space-y-2">
        <div className="flex items-center justify-center gap-4">
          <Link to="/terms" className="hover:text-foreground hover:underline">Termos de Utilização</Link>
          <Link to="/privacy" className="hover:text-foreground hover:underline">Política de Privacidade</Link>
        </div>
        <p>© {new Date().getFullYear()} Sabor POS — Todos os direitos reservados.</p>
      </footer>
    </div>
  );
}
