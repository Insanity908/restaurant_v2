import { Link } from 'react-router-dom';
import { Coffee, ArrowLeft } from 'lucide-react';

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      <header className="container mx-auto px-6 py-5 flex items-center justify-between">
        <Link to="/landing" className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-lg bg-primary/15 flex items-center justify-center">
            <Coffee className="w-5 h-5 text-primary" />
          </div>
          <span className="font-heading font-bold">Sabor POS</span>
        </Link>
        <Link to="/landing" className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-4 h-4" /> Voltar
        </Link>
      </header>

      <main className="container mx-auto px-6 py-10 max-w-2xl space-y-6">
        <h1 className="font-heading text-2xl font-bold">Termos de Utilização</h1>
        <p className="text-xs text-muted-foreground">Última atualização: 22 de agosto de 2026</p>

        <div className="space-y-5 text-sm text-muted-foreground leading-relaxed">
          <section>
            <h2 className="font-heading text-base font-semibold text-foreground mb-1.5">1. Aceitação dos termos</h2>
            <p>Ao criar uma conta e utilizar o Sabor POS, concorda com estes Termos de Utilização. Se não concordar, não deve utilizar o serviço.</p>
          </section>
          <section>
            <h2 className="font-heading text-base font-semibold text-foreground mb-1.5">2. O serviço</h2>
            <p>O Sabor POS é um sistema de gestão para restaurantes (ponto de venda, cozinha, inventário, equipa, relatórios e pedidos pelo cliente). O acesso é feito por planos pagos, com um período de teste gratuito inicial.</p>
          </section>
          <section>
            <h2 className="font-heading text-base font-semibold text-foreground mb-1.5">3. Conta e responsabilidade</h2>
            <p>É responsável por manter a confidencialidade da sua password e PINs de equipa, e por toda a atividade realizada na sua conta. Deve informar-nos imediatamente de qualquer uso não autorizado que detete.</p>
          </section>
          <section>
            <h2 className="font-heading text-base font-semibold text-foreground mb-1.5">4. Pagamentos e planos</h2>
            <p>A ativação e renovação de planos é processada manualmente após confirmação de pagamento (M-Pesa, e-Mola ou transferência bancária). Os preços e funcionalidades de cada plano estão descritos na página de Preços e podem ser atualizados a qualquer momento, sem efeito retroativo sobre pagamentos já processados.</p>
          </section>
          <section>
            <h2 className="font-heading text-base font-semibold text-foreground mb-1.5">5. Dados</h2>
            <p>Os dados introduzidos no sistema (cardápio, pedidos, clientes, equipa) pertencem ao restaurante que os criou. Pode exportar os seus dados a qualquer momento através das funcionalidades de relatórios da aplicação.</p>
          </section>
          <section>
            <h2 className="font-heading text-base font-semibold text-foreground mb-1.5">6. Limitação de responsabilidade</h2>
            <p>O serviço é fornecido "tal como está". Fazemos o possível para manter o sistema disponível e os dados seguros, mas não garantimos disponibilidade ininterrupta nem estamos isentos de responsabilidade por perdas resultantes de uso indevido, falhas de rede do lado do utilizador, ou força maior.</p>
          </section>
          <section>
            <h2 className="font-heading text-base font-semibold text-foreground mb-1.5">7. Contacto</h2>
            <p>Para questões sobre estes termos, contacte-nos através do canal indicado na página de Preços.</p>
          </section>
        </div>
      </main>
    </div>
  );
}
