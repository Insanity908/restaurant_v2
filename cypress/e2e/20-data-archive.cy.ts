import { TENANT_ID } from '../support/roles';

// Restrição de acesso (só admin) já é coberta pela matriz genérica em
// 03-route-permissions.cy.ts — ver ROUTE_PERMISSIONS['/data-archive'] em
// support/roles.ts. Este ficheiro testa o comportamento da própria página:
// geração do relatório anual, exportações, e o gate de exclusão definitiva
// de dados antigos (report + recibos obrigatórios antes, texto exacto
// "APAGAR" para confirmar, chamada à edge function purge-old-data).
//
// expenses/expense_amount_history/staff_salaries não estão em
// CATALOG_TABLES — interceptados aqui como vazios para não afectar o
// cálculo de despesas fixas (fora do âmbito destes testes; ver §3.1 da spec
// para os testes de cálculo de lucro líquido/IVA).

function mockFixedCostsEmpty() {
  cy.intercept('GET', '**/rest/v1/expenses?*', { statusCode: 200, body: [] });
  cy.intercept('GET', '**/rest/v1/expense_amount_history?*', { statusCode: 200, body: [] });
  cy.intercept('GET', '**/rest/v1/staff_salaries?*', { statusCode: 200, body: [] });
}

function fakeOrder(overrides: Record<string, unknown>) {
  return {
    id: 'o0000000-0000-0000-0000-00000000o001', table_id: null, table_number: null,
    type: 'dine-in', status: 'completed', customer_id: null, customer_name: null, customer_phone: null,
    delivery_address: null, total: 1000, discount: 0, tip: 0, packaging_fee: 0,
    payment_method: 'cash', paid: true, created_by: null, closed_by: null, cancelled_by: null,
    created_at: '2025-01-10T10:00:00.000Z', updated_at: '2025-01-10T10:00:00.000Z',
    closed_at: null, cancelled_at: null, order_items: [], order_events: [],
    ...overrides,
  };
}

const ORDERS_FIXTURE = [
  fakeOrder({ id: 'o0000000-0000-0000-0000-00000000o001', total: 1000, created_at: '2025-01-05T10:00:00.000Z' }),
  fakeOrder({ id: 'o0000000-0000-0000-0000-00000000o002', total: 2000, created_at: '2025-01-20T10:00:00.000Z' }),
  fakeOrder({ id: 'o0000000-0000-0000-0000-00000000o003', total: 500, created_at: '2025-02-15T10:00:00.000Z' }),
];

function generateReport() {
  cy.contains('button', /gerar relatório/i).click();
}

describe('Arquivo de Dados — relatório anual', () => {
  beforeEach(() => {
    mockFixedCostsEmpty();
    cy.loginAs('admin');
  });

  it('gera o relatório do ano seleccionado e mostra os KPIs agregados', () => {
    cy.intercept('GET', '**/rest/v1/orders?*', { statusCode: 200, body: ORDERS_FIXTURE }).as('getOrders');
    cy.intercept('GET', '**/rest/v1/shifts?*', { statusCode: 200, body: [] }).as('getShifts');
    cy.intercept('GET', '**/rest/v1/security_alerts?*', { statusCode: 200, body: [] }).as('getAlerts');

    cy.visit('/data-archive');
    generateReport();
    cy.wait(['@getOrders', '@getShifts', '@getAlerts']);

    cy.contains('Pedidos Pagos').parent().contains('3');
    // O separador de milhares de toLocaleString('pt-PT') varia por motor/ICU
    // (espaço normal, non-breaking space, ou nenhum) — \s? tolera todos.
    cy.contains('Receita Total').parent().contains(/3\s?500/);
  });

  it('filtro por mês recalcula os KPIs sem novo pedido de rede', () => {
    cy.intercept('GET', '**/rest/v1/orders?*', { statusCode: 200, body: ORDERS_FIXTURE }).as('getOrders');
    cy.intercept('GET', '**/rest/v1/shifts?*', { statusCode: 200, body: [] });
    cy.intercept('GET', '**/rest/v1/security_alerts?*', { statusCode: 200, body: [] });

    cy.visit('/data-archive');
    generateReport();
    cy.wait('@getOrders');
    cy.contains('Pedidos Pagos').parent().contains('3');

    cy.get('[role="combobox"]').eq(1).click({ force: true }); // Ano, Mês — o 2º combobox é o Mês
    cy.contains('[role="option"]', 'Janeiro').click();

    cy.contains('Pedidos Pagos').parent().contains('2');
    cy.contains('Receita Total').parent().contains(/3\s?000/);
  });

  it('sem dados no período, exportar mostra erro em vez de gerar um ficheiro vazio', () => {
    cy.intercept('GET', '**/rest/v1/orders?*', { statusCode: 200, body: [] }).as('getOrders');
    cy.intercept('GET', '**/rest/v1/shifts?*', { statusCode: 200, body: [] });
    cy.intercept('GET', '**/rest/v1/security_alerts?*', { statusCode: 200, body: [] });

    cy.visit('/data-archive');
    generateReport();
    cy.wait('@getOrders');
    cy.contains('button', /pdf/i).click();
    cy.get('[data-sonner-toaster]').should('contain.text', 'Sem dados para exportar');
  });

  it('com dados no período, PDF/Excel/CSV/Recibos exportam com sucesso (toast de confirmação)', () => {
    cy.intercept('GET', '**/rest/v1/orders?*', { statusCode: 200, body: ORDERS_FIXTURE }).as('getOrders');
    cy.intercept('GET', '**/rest/v1/shifts?*', { statusCode: 200, body: [] });
    cy.intercept('GET', '**/rest/v1/security_alerts?*', { statusCode: 200, body: [] });

    cy.visit('/data-archive');
    generateReport();
    cy.wait('@getOrders');

    cy.contains('button', /pdf/i).click();
    cy.get('[data-sonner-toaster]').should('contain.text', 'Relatório PDF exportado');
    cy.contains('button', /excel/i).click();
    cy.get('[data-sonner-toaster]').should('contain.text', 'Relatório EXCEL exportado');
    cy.contains('button', /csv/i).click();
    cy.get('[data-sonner-toaster]').should('contain.text', 'Relatório CSV exportado');
    cy.contains('button', /recibos do período/i).click();
    cy.get('[data-sonner-toaster]').should('contain.text', 'Recibos descarregados');
  });
});

describe('Arquivo de Dados — apagar dados antigos', () => {
  beforeEach(() => {
    mockFixedCostsEmpty();
    cy.intercept('GET', '**/rest/v1/orders?*', { statusCode: 200, body: ORDERS_FIXTURE }).as('getOrders');
    cy.intercept('GET', '**/rest/v1/shifts?*', { statusCode: 200, body: [] });
    cy.intercept('GET', '**/rest/v1/security_alerts?*', { statusCode: 200, body: [] });
    cy.loginAs('admin');
    cy.visit('/data-archive');
  });

  it('botão de apagar começa desabilitado — só liga depois de gerar relatório E descarregar recibos', () => {
    cy.contains('button', /apagar dados antigos/i).should('be.disabled');

    generateReport();
    cy.wait('@getOrders');
    cy.contains('button', /apagar dados antigos/i).should('be.disabled');

    cy.contains('button', /recibos do período/i).click();
    cy.contains('button', /apagar dados antigos/i).should('not.be.disabled');
  });

  it('confirmação exige escrever "APAGAR" exactamente — qualquer outro texto mantém desabilitado', () => {
    generateReport();
    cy.wait('@getOrders');
    cy.contains('button', /recibos do período/i).click();
    cy.contains('button', /apagar dados antigos/i).click();

    cy.get('[role="alertdialog"]').should('be.visible').within(() => {
      cy.get('input').type('apagar'); // minúsculas — não conta
      cy.contains('button', /apagar definitivamente/i).should('be.disabled');
      cy.get('input').clear().type('APAGAR ');
      cy.contains('button', /apagar definitivamente/i).should('be.disabled');
      cy.get('input').clear().type('APAGAR');
      cy.contains('button', /apagar definitivamente/i).should('not.be.disabled');
    });
  });

  it('confirma a exclusão: chama purge-old-data com o tenant e um cutoff de ~1 ano, mostra as contagens devolvidas', () => {
    cy.intercept('POST', '**/functions/v1/purge-old-data', (req) => {
      expect(req.body.tenantId).to.eq(TENANT_ID);
      const cutoff = new Date(req.body.cutoffDate).getTime();
      const oneYearAgo = Date.now() - 365 * 86400 * 1000;
      expect(Math.abs(cutoff - oneYearAgo)).to.be.lessThan(2 * 86400 * 1000); // tolerância de 2 dias
      req.reply({ statusCode: 200, body: { ok: true, cutoff: req.body.cutoffDate, ordersDeleted: 5, shiftsDeleted: 2, alertsDeleted: 1 } });
    }).as('purge');

    generateReport();
    cy.wait('@getOrders');
    cy.contains('button', /recibos do período/i).click();
    cy.contains('button', /apagar dados antigos/i).click();
    cy.get('[role="alertdialog"]').within(() => {
      cy.get('input').type('APAGAR');
      cy.contains('button', /apagar definitivamente/i).click();
    });
    cy.wait('@purge');
    cy.get('[data-sonner-toaster]').should('contain.text', 'Apagados: 5 pedidos, 2 turnos, 1 alertas');
  });

  it('falha da edge function mostra erro, sem quebrar a página', () => {
    cy.intercept('POST', '**/functions/v1/purge-old-data', { statusCode: 500, body: { error: 'boom' } }).as('purge');

    generateReport();
    cy.wait('@getOrders');
    cy.contains('button', /recibos do período/i).click();
    cy.contains('button', /apagar dados antigos/i).click();
    cy.get('[role="alertdialog"]').within(() => {
      cy.get('input').type('APAGAR');
      cy.contains('button', /apagar definitivamente/i).click();
    });
    cy.wait('@purge');
    cy.get('[data-sonner-toaster]').should('contain.text', 'Não foi possível apagar os dados antigos');
    cy.contains('button', /apagar dados antigos/i).should('be.visible');
  });
});
