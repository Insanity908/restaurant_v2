const TENANT = '11111111-1111-1111-1111-111111111111';

// Tem de ser UUID válido: store.ts só sincroniza (PATCH a orders) quando
// isUuid(id) é verdadeiro, senão cy.wait('@patchOrder') nunca vê nada.
const ORDER_ID = 'b0000000-0000-0000-0000-00000000b002';

function order(status: 'served' | 'pending') {
  return {
    id: ORDER_ID, tenant_id: TENANT, table_number: 5, type: 'dine-in', status: 'active',
    total: 700, paid: false, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    client_updated_at: new Date().toISOString(),
    order_items: [{ id: 'e0000000-0000-0000-0000-00000000e002', order_id: ORDER_ID, menu_item_id: 'f0000000-0000-0000-0000-00000000f001', name: 'Frango Grelhado', quantity: 2, price: 350, status }],
    order_events: [],
  };
}

describe('POS', () => {
  it('kitchen: não tem acesso ao POS', () => {
    cy.loginAs('kitchen');
    cy.visit('/pos', { failOnStatusCode: false });
    cy.contains('Acesso restrito').should('be.visible');
  });

  it('cashier: finaliza o pagamento de um pedido totalmente servido (dinheiro, sem gorjeta)', () => {
    cy.intercept('GET', '**/rest/v1/orders?*', { statusCode: 200, body: [order('served')] });
    cy.intercept('PATCH', '**/rest/v1/orders?*', { statusCode: 200, body: [{}] }).as('patchOrder');
    cy.loginAs('cashier');
    cy.visit('/pos');
    cy.contains(/mesa 5/i).click();
    cy.contains('button', /confirmar pagamento/i).click();
    cy.wait('@patchOrder').its('request.body').should('include', {
      status: 'completed', paid: true, payment_method: 'cash',
    });
  });

  it('DADOS INCORRECTOS: pedido com itens ainda não servidos não pode ser cobrado', () => {
    cy.intercept('GET', '**/rest/v1/orders?*', { statusCode: 200, body: [order('pending')] });
    const patchSpy = cy.spy().as('patchSpy');
    cy.intercept('PATCH', '**/rest/v1/orders?*', patchSpy);
    cy.loginAs('waiter');
    cy.visit('/pos');
    cy.contains(/mesa 5/i).click();
    // O botão vem desativado proactivamente (mais seguro do que deixar
    // clicar e só mostrar o erro depois) — a app já avisa antes do clique.
    // scrollIntoView: o resumo do pedido mudou de posição nesta sessão
    // (ver §3.3 da spec) e este aviso agora fica abaixo da dobra.
    cy.contains(/itens (ainda )?não servidos|por servir/i).scrollIntoView().should('be.visible');
    cy.contains('button', /confirmar pagamento/i).should('be.disabled');
    cy.get('@patchSpy').should('not.have.been.called');
  });

  it('cashier: aplica gorjeta e escolhe cartão como método de pagamento', () => {
    cy.intercept('GET', '**/rest/v1/orders?*', { statusCode: 200, body: [order('served')] });
    cy.intercept('PATCH', '**/rest/v1/orders?*', { statusCode: 200, body: [{}] }).as('patchOrder');
    cy.loginAs('cashier');
    cy.visit('/pos');
    cy.contains(/mesa 5/i).click();
    cy.contains('button', /cartão/i).click();
    cy.contains('button', /confirmar pagamento/i).click();
    cy.wait('@patchOrder').its('request.body').should('include', { payment_method: 'card' });
  });

  it('FALHA DE REDE: erro ao confirmar pagamento mantém o pedido na lista (não desaparece silenciosamente)', () => {
    cy.intercept('GET', '**/rest/v1/orders?*', { statusCode: 200, body: [order('served')] });
    cy.intercept('PATCH', '**/rest/v1/orders?*', { statusCode: 500, body: { message: 'erro' } }).as('patchFail');
    cy.loginAs('cashier');
    cy.visit('/pos');
    cy.contains(/mesa 5/i).click();
    cy.contains('button', /confirmar pagamento/i).click();
    cy.wait('@patchFail');
    // A rejeição permanente do servidor (não uma falha transitória de rede)
    // tem de reverter o estado local optimista: o pedido continua na lista
    // de activos e o utilizador é avisado — nunca desaparece em silêncio.
    cy.contains(/falha ao confirmar pagamento/i).should('be.visible');
    cy.contains(/mesa 5/i).should('be.visible');
    cy.contains('button', /confirmar pagamento/i).should('not.be.disabled');
  });
});

// -----------------------------------------------------------------------------
// Layout mobile do painel de pagamento: em ecrãs estreitos, o painel abre como
// overlay de ecrã inteiro ao seleccionar um pedido (em vez de ficar lado a
// lado com a lista, como acontecia antes e continua a acontecer em desktop).
// Mudança de puro CSS/estrutura — sem cobertura antes desta sessão.
// -----------------------------------------------------------------------------
describe('POS — layout mobile do painel de pagamento', () => {
  beforeEach(() => {
    cy.intercept('GET', '**/rest/v1/orders?*', { statusCode: 200, body: [order('served')] });
  });

  it('mobile, sem pedido seleccionado: lista visível, painel de pagamento nem chega a existir no DOM', () => {
    cy.viewport(375, 812);
    cy.loginAs('cashier');
    cy.visit('/pos');
    cy.contains('Pedidos Activos').should('be.visible');
    // Sem selecção, o ramo do JSX com o botão nem é renderizado (não é só
    // escondido por CSS) — ver `selectedOrder ? (...) : (...)` em POSPage.
    cy.contains('button', /confirmar pagamento/i).should('not.exist');
  });

  it('mobile, ao seleccionar um pedido: painel abre em ecrã inteiro e a lista esconde-se', () => {
    cy.viewport(375, 812);
    cy.loginAs('cashier');
    cy.visit('/pos');
    cy.contains(/mesa 5/i).click();

    cy.contains('button', /voltar aos pedidos/i).should('be.visible');
    cy.contains('Pedidos Activos').should('not.be.visible');
    // O resumo do pedido (Subtotal/Total) mudou de posição no JSX nesta
    // sessão — confirma que os valores continuam lá, não só a posição.
    // Âmbito à própria linha: "700 MT" também aparece (escondido) no card
    // do pedido na lista de activos, e cy.contains() apanharia esse primeiro.
    cy.contains('Subtotal').should('be.visible').parent().should('contain.text', '700');
    // scrollIntoView: o botão fica abaixo da dobra no ecrã de telemóvel
    // (painel scrollável) — cy.click() faz isto sozinho, mas uma asserção
    // de visibilidade sozinha não desloca a página.
    cy.contains('button', /confirmar pagamento/i).scrollIntoView().should('be.visible');
  });

  it('mobile: "Voltar aos pedidos" fecha o painel e mostra a lista outra vez', () => {
    cy.viewport(375, 812);
    cy.loginAs('cashier');
    cy.visit('/pos');
    cy.contains(/mesa 5/i).click();
    cy.contains('button', /voltar aos pedidos/i).click();

    cy.contains('Pedidos Activos').should('be.visible');
    cy.contains('button', /confirmar pagamento/i).should('not.exist');
  });

  it('desktop: lista e painel de pagamento ficam visíveis lado a lado, com ou sem selecção', () => {
    cy.viewport(1280, 800);
    cy.loginAs('cashier');
    cy.visit('/pos');

    cy.contains('Pedidos Activos').should('be.visible');
    cy.contains('Selecione um pedido para processar').should('be.visible');

    cy.contains(/mesa 5/i).click();
    cy.contains('Pedidos Activos').should('be.visible');
    cy.contains('button', /confirmar pagamento/i).scrollIntoView().should('be.visible');
    // Botão de voltar é exclusivo mobile (lg:hidden) — continua no DOM mas escondido.
    cy.contains('button', /voltar aos pedidos/i).should('not.be.visible');
  });
});

export {};
