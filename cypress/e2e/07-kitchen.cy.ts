const TENANT = '11111111-1111-1111-1111-111111111111';

// IDs têm de ser UUIDs válidos: store.ts só sincroniza escritas quando
// isUuid(id) é verdadeiro — um id "de leitura fácil" faz a app ignorar
// sempre a sincronização (e syncOrderItems só corre se o id do PEDIDO for
// UUID), e os testes nunca veem os pedidos de rede esperados.
const ORDER_ID = 'b0000000-0000-0000-0000-00000000b001';

function orderWithItem(itemStatus: string) {
  return {
    id: ORDER_ID, tenant_id: TENANT, table_number: 7,
    type: 'dine-in', status: 'active', total: 700, paid: false,
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    client_updated_at: new Date().toISOString(),
    order_items: [{ id: 'e0000000-0000-0000-0000-00000000e001', order_id: ORDER_ID, menu_item_id: 'f0000000-0000-0000-0000-00000000f001', name: 'Frango Grelhado', quantity: 2, price: 350, status: itemStatus }],
    order_events: [],
  };
}

// IMPORTANTE: mudar o estado de um item NÃO faz PATCH a order_items — o
// store.ts (syncOrderItems) apaga todas as linhas do pedido e reinsere a
// lista completa (delete + insert em bloco), por isso é isso que se
// intercepta aqui, não um PATCH pontual a uma linha.
describe('Cozinha', () => {
  it('cashier: não tem acesso à Cozinha', () => {
    cy.loginAs('cashier');
    cy.visit('/kitchen', { failOnStatusCode: false });
    cy.contains('Acesso restrito').should('be.visible');
  });

  it('kitchen: vê pedidos pendentes e avança um item para "Preparando" ao clicar', () => {
    const order = orderWithItem('pending');
    cy.intercept('GET', '**/rest/v1/orders?*', { statusCode: 200, body: [order] });
    cy.intercept('DELETE', '**/rest/v1/order_items?*', { statusCode: 204, body: '' }).as('delItems');
    cy.intercept('POST', '**/rest/v1/order_items*', { statusCode: 201, body: [] }).as('insertItems');
    cy.loginAs('kitchen');
    cy.visit('/kitchen');
    cy.contains('Frango Grelhado').click();
    cy.wait('@delItems');
    cy.wait('@insertItems').its('request.body').should((body) => {
      expect(body).to.have.length(1);
      expect(body[0]).to.include({ status: 'preparing', order_id: order.id });
    });
  });

  it('waiter: só vê itens prontos para servir, e marcar como servido reenvia a lista com o novo estado', () => {
    const order = orderWithItem('ready');
    cy.intercept('GET', '**/rest/v1/orders?*', { statusCode: 200, body: [order] });
    cy.intercept('DELETE', '**/rest/v1/order_items?*', { statusCode: 204, body: '' });
    cy.intercept('POST', '**/rest/v1/order_items*', { statusCode: 201, body: [] }).as('insertServed');
    cy.loginAs('waiter');
    cy.visit('/kitchen');
    cy.contains('Frango Grelhado').click();
    cy.wait('@insertServed').its('request.body.0.status').should('eq', 'served');
  });

  it('kitchen: pedido sem itens pendentes/em preparo não aparece na fila da cozinha', () => {
    const order = orderWithItem('served');
    cy.intercept('GET', '**/rest/v1/orders?*', { statusCode: 200, body: [order] });
    cy.loginAs('kitchen');
    cy.visit('/kitchen');
    cy.contains('Nenhum pedido na fila').should('be.visible');
  });

  it('FALHA DE REDE: erro ao reenviar os itens não bloqueia a interface', () => {
    const order = orderWithItem('pending');
    cy.intercept('GET', '**/rest/v1/orders?*', { statusCode: 200, body: [order] });
    cy.intercept('DELETE', '**/rest/v1/order_items?*', { statusCode: 500, body: { message: 'erro' } }).as('delFail');
    cy.loginAs('kitchen');
    cy.visit('/kitchen');
    cy.contains('Frango Grelhado').click();
    cy.wait('@delFail');
    cy.contains('Cozinha - Pedidos em Tempo Real').should('be.visible');
  });
});

export {};
