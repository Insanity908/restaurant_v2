import { Link } from 'react-router-dom';
import { Coffee, ArrowLeft } from 'lucide-react';

export default function PrivacyPage() {
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
        <h1 className="font-heading text-2xl font-bold">Política de Privacidade</h1>
        <p className="text-xs text-muted-foreground">Última atualização: 22 de agosto de 2026</p>

        <div className="space-y-5 text-sm text-muted-foreground leading-relaxed">
          <section>
            <h2 className="font-heading text-base font-semibold text-foreground mb-1.5">1. Que dados recolhemos</h2>
            <p>Ao usar o Sabor POS recolhemos: dados de conta (nome, email, telefone), dados operacionais que introduz (cardápio, pedidos, clientes, equipa, despesas) e dados de pagamento da subscrição (número de telefone M-Pesa/e-Mola, referência de pagamento). Nunca pedimos nem armazenamos dados de cartão bancário.</p>
          </section>
          <section>
            <h2 className="font-heading text-base font-semibold text-foreground mb-1.5">2. Como usamos os dados</h2>
            <p>Os dados são usados exclusivamente para operar o serviço: autenticação, sincronização entre dispositivos, geração de relatórios, e confirmação manual de pagamentos de subscrição. Não vendemos nem partilhamos os seus dados com terceiros para fins de marketing.</p>
          </section>
          <section>
            <h2 className="font-heading text-base font-semibold text-foreground mb-1.5">3. Dados de clientes do restaurante</h2>
            <p>Se usar o programa de fidelidade ou o pedido pelo cliente (QR/entrega), recolhemos nome, telefone e, opcionalmente, morada e NUIT dos clientes do restaurante, inseridos por si ou pelo próprio cliente. É responsável por informar os seus clientes sobre esta recolha, de acordo com a legislação aplicável.</p>
          </section>
          <section>
            <h2 className="font-heading text-base font-semibold text-foreground mb-1.5">4. Armazenamento e segurança</h2>
            <p>Os dados são armazenados em infraestrutura de nuvem segura, com isolamento entre restaurantes (cada conta só acede aos seus próprios dados) e controlo de acesso por papel dentro da equipa. As comunicações são encriptadas em trânsito (HTTPS).</p>
          </section>
          <section>
            <h2 className="font-heading text-base font-semibold text-foreground mb-1.5">5. Retenção e eliminação</h2>
            <p>Pode eliminar dados operacionais antigos (pedidos, turnos, alertas com mais de um ano) através da funcionalidade de Arquivo de Dados. Ao cancelar a conta, pode solicitar a eliminação dos restantes dados.</p>
          </section>
          <section>
            <h2 className="font-heading text-base font-semibold text-foreground mb-1.5">6. Os seus direitos</h2>
            <p>Pode aceder, corrigir ou exportar os seus dados a qualquer momento através da aplicação. Para pedidos de eliminação total da conta, contacte-nos através do canal indicado na página de Preços.</p>
          </section>
        </div>
      </main>
    </div>
  );
}
