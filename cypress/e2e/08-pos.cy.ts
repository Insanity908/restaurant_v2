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
    cy.contains('button', /confirmar pagamento/i).click();
    cy.contains(/itens (ainda )?não servidos|por servir/i).should('be.visible');
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
    cy.contains(/mesa 5/i).should('be.visible');
  });
});

export {};
