import { ROLE_HOME } from '../support/roles';

describe('Dashboard — redireccionamento por papel', () => {
  it('admin: fica em "/" e vê o Dashboard', () => {
    cy.loginAs('admin');
    cy.location('pathname').should('eq', '/');
    cy.contains('Acesso restrito').should('not.exist');
  });

  it('manager: fica em "/" e vê o Dashboard', () => {
    cy.loginAs('manager');
    cy.location('pathname').should('eq', '/');
    cy.contains('Acesso restrito').should('not.exist');
  });

  (['cashier', 'waiter', 'kitchen'] as const).forEach(role => {
    it(`${role}: login não fica em "/" — vai directo para ${ROLE_HOME[role]}`, () => {
      cy.loginAs(role);
      cy.location('pathname').should('eq', ROLE_HOME[role]);
    });

    it(`${role}: visitar "/" manualmente mostra "Acesso restrito" (não o Dashboard)`, () => {
      cy.loginAs(role);
      cy.visit('/');
      cy.contains('Acesso restrito').should('be.visible');
    });
  });

  it('superadmin: login vai directo para /admin, nunca vê o Dashboard de tenant', () => {
    cy.loginAs('superadmin');
    cy.location('pathname').should('eq', '/admin');
  });
});
