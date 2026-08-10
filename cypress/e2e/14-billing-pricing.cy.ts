describe('Faturação', () => {
  (['manager', 'cashier', 'waiter', 'kitchen'] as const).forEach(role => {
    it(`${role}: SEM acesso a Faturação`, () => {
      cy.loginAs(role);
      cy.visit('/billing', { failOnStatusCode: false });
      cy.contains('Acesso restrito').should('be.visible');
    });
  });

  it('admin: vê o estado do trial e os dias restantes', () => {
    cy.loginAs('admin');
    cy.visit('/billing');
    cy.contains(/trial|período experimental/i).should('be.visible');
  });

  it('admin: "Mudar plano" navega para /pricing', () => {
    cy.loginAs('admin');
    cy.visit('/billing');
    cy.contains('a, button', /mudar plano/i).click();
    cy.location('pathname').should('eq', '/pricing');
  });
});

describe('Preços (Pricing)', () => {
  it('manager: SEM acesso a /pricing', () => {
    cy.loginAs('manager');
    cy.visit('/pricing', { failOnStatusCode: false });
    cy.contains('Acesso restrito').should('be.visible');
  });

  it('admin: vê os 4 planos disponíveis', () => {
    cy.loginAs('admin');
    cy.visit('/pricing');
    cy.contains(/mensal/i).should('be.visible');
    cy.contains(/trimestral/i).should('be.visible');
    cy.contains(/semestral/i).should('be.visible');
    cy.contains(/anual/i).should('be.visible');
  });
});

export {};
