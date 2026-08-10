const CUSTOMER = {
  // UUID válido: store.ts só sincroniza (DELETE) quando isUuid(id) é
  // verdadeiro, senão cy.wait('@delCustomer') nunca vê nada.
  id: 'd0000000-0000-0000-0000-00000000d001', tenant_id: '11111111-1111-1111-1111-111111111111',
  name: 'Maria João', phone: '841234567', email: null, nuit: null, birthday: null,
  notes: null, points_adjustment: 0,
};

describe('Clientes', () => {
  beforeEach(() => {
    cy.intercept('GET', '**/rest/v1/customers?*', { statusCode: 200, body: [CUSTOMER] }).as('getCustomers');
  });

  it('kitchen: não tem acesso a Clientes', () => {
    cy.loginAs('kitchen');
    cy.visit('/customers', { failOnStatusCode: false });
    cy.contains('Acesso restrito').should('be.visible');
  });

  it('waiter: vê a lista de clientes', () => {
    cy.loginAs('waiter');
    cy.visit('/customers');
    cy.contains('Maria João').should('be.visible');
  });

  it('cashier: cria um novo cliente', () => {
    cy.intercept('POST', '**/rest/v1/customers*', { statusCode: 201, body: [{ ...CUSTOMER, id: 'c-novo', name: 'Pedro Costa', phone: '821112223' }] }).as('postCustomer');
    cy.loginAs('cashier');
    cy.visit('/customers');
    cy.contains('button', /novo cliente/i).click();
    cy.get('[role="dialog"]').within(() => {
      cy.fieldByLabel('Nome').type('Pedro Costa');
      cy.fieldByLabel('Telefone').type('821112223');
      cy.contains('button', /^guardar$/i).click();
    });
    cy.wait('@postCustomer').its('request.body').should('include', { name: 'Pedro Costa' });
  });

  it('DADOS INCORRECTOS: telefone inválido mantém o botão "Guardar" desactivado', () => {
    cy.loginAs('admin');
    cy.visit('/customers');
    cy.contains('button', /novo cliente/i).click();
    cy.get('[role="dialog"]').within(() => {
      cy.fieldByLabel('Nome').type('Cliente Teste');
      cy.fieldByLabel('Telefone').type('123'); // demasiado curto para um nº moçambicano
      cy.contains(/deve ter 9 dígitos/i).should('be.visible');
      cy.contains('button', /^guardar$/i).should('be.disabled');
    });
  });

  it('admin: remove um cliente após confirmar', () => {
    cy.intercept('DELETE', '**/rest/v1/customers?*', { statusCode: 204, body: '' }).as('delCustomer');
    cy.loginAs('admin');
    cy.visit('/customers');
    cy.contains('Maria João').parents('.p-4').find('[aria-label="Remover"]').click();
    cy.get('[role="alertdialog"]').contains('button', /^remover$/i).click();
    cy.wait('@delCustomer');
  });
});

export {};
