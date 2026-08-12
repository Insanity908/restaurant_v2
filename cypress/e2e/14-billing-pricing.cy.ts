// Facturação/planos ainda não estão prontos para produção — /billing e
// /pricing ficam bloqueados (redireccionam para "/") para todos os papéis,
// incluindo admin, até essa área ser reactivada.
describe('Faturação e Preços (bloqueados temporariamente)', () => {
  (['admin', 'manager', 'cashier', 'waiter', 'kitchen'] as const).forEach(role => {
    it(`${role}: /billing redirecciona para "/"`, () => {
      cy.loginAs(role);
      cy.visit('/billing', { failOnStatusCode: false });
      cy.location('pathname').should('eq', '/');
    });

    it(`${role}: /pricing redirecciona para "/"`, () => {
      cy.loginAs(role);
      cy.visit('/pricing', { failOnStatusCode: false });
      cy.location('pathname').should('eq', '/');
    });
  });

  it('a barra lateral não mostra "Faturação"', () => {
    cy.loginAs('admin');
    cy.visit('/');
    cy.contains('Faturação').should('not.exist');
  });
});

export {};
