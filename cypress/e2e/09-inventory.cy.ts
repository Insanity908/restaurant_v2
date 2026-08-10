const ITEM = {
  // UUID válido: store.ts só sincroniza (PATCH) quando isUuid(id) é
  // verdadeiro, senão cy.wait('@patchInv') nunca vê nada.
  id: 'c0000000-0000-0000-0000-00000000c001', tenant_id: '11111111-1111-1111-1111-111111111111',
  name: 'Frango (kg)', unit: 'kg', current_stock: 15, min_stock: 4, cost_per_unit: 280,
  linked_menu_item_ids: [], usage_per_serving: 0.3,
};

describe('Estoque', () => {
  (['cashier', 'waiter', 'kitchen'] as const).forEach(role => {
    it(`${role}: SEM acesso a Estoque — nem a rota carrega`, () => {
      cy.loginAs(role);
      cy.visit('/inventory', { failOnStatusCode: false });
      cy.contains('Acesso restrito').should('be.visible');
    });
  });

  it('manager: vê a lista de stock e o alerta de stock baixo', () => {
    cy.intercept('GET', '**/rest/v1/inventory_items?*', { statusCode: 200, body: [{ ...ITEM, current_stock: 1 }] });
    cy.loginAs('manager');
    cy.visit('/inventory');
    cy.contains('Frango (kg)').should('be.visible');
  });

  it('admin: adiciona um novo ingrediente', () => {
    cy.intercept('GET', '**/rest/v1/inventory_items?*', { statusCode: 200, body: [] });
    cy.intercept('POST', '**/rest/v1/inventory_items*', { statusCode: 201, body: [{ ...ITEM, id: 'inv-novo', name: 'Arroz (kg)' }] }).as('postInv');
    cy.loginAs('admin');
    cy.visit('/inventory');
    cy.contains('button', /^novo$/i).click();
    cy.get('[role="dialog"]').within(() => {
      cy.fieldByLabel('Nome').type('Arroz (kg)');
      cy.fieldByLabel('Stock Actual').clear().type('20');
      cy.contains('button', /adicionar/i).click();
    });
    cy.wait('@postInv').its('request.body').should('include', { name: 'Arroz (kg)', current_stock: 20 });
  });

  it('DADOS INCORRECTOS: não deixa gravar sem nome', () => {
    cy.intercept('GET', '**/rest/v1/inventory_items?*', { statusCode: 200, body: [] });
    const postSpy = cy.spy().as('postSpy');
    cy.intercept('POST', '**/rest/v1/inventory_items*', postSpy);
    cy.loginAs('admin');
    cy.visit('/inventory');
    cy.contains('button', /^novo$/i).click();
    cy.get('[role="dialog"]').within(() => {
      cy.contains('button', /adicionar/i).click();
    });
    cy.get('@postSpy').should('not.have.been.called');
  });

  it('manager: edita o stock mínimo de um ingrediente existente', () => {
    cy.intercept('GET', '**/rest/v1/inventory_items?*', { statusCode: 200, body: [ITEM] });
    cy.intercept('PATCH', '**/rest/v1/inventory_items?*', { statusCode: 200, body: [{ ...ITEM, min_stock: 10 }] }).as('patchInv');
    cy.loginAs('manager');
    cy.visit('/inventory');
    cy.contains('tr', 'Frango (kg)').find('button').first().click(); // botão "editar" (lápis)
    cy.get('[role="dialog"]').within(() => {
      cy.fieldByLabel('Stock Mínimo').clear().type('10');
      cy.contains('button', /^guardar$/i).click();
    });
    cy.wait('@patchInv').its('request.body').should('include', { min_stock: 10 });
  });
});

export {};
