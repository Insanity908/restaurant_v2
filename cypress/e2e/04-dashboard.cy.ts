// Nota: "o login redirecciona para o ROLE_HOME certo" já é coberto por
// 01-auth.cy.ts (via o formulário de login real, para todos os papéis,
// incluindo superadmin). Aqui testamos especificamente o comportamento do
// Dashboard/"/" depois de já autenticado — por isso cy.loginAs() é sempre
// seguido de cy.visit() explícito: cy.session() nunca garante que o browser
// fica na página para onde o setup navegou (sobretudo quando a sessão é
// reaproveitada de cache, já usada por outro spec na mesma corrida).
describe('Dashboard — redireccionamento por papel', () => {
  it('admin: fica em "/" e vê o Dashboard', () => {
    cy.loginAs('admin');
    cy.visit('/');
    cy.location('pathname').should('eq', '/');
    cy.contains('Acesso restrito').should('not.exist');
  });

  it('manager: fica em "/" e vê o Dashboard', () => {
    cy.loginAs('manager');
    cy.visit('/');
    cy.location('pathname').should('eq', '/');
    cy.contains('Acesso restrito').should('not.exist');
  });

  (['cashier', 'waiter', 'kitchen'] as const).forEach(role => {
    it(`${role}: visitar "/" manualmente mostra "Acesso restrito" (não o Dashboard)`, () => {
      cy.loginAs(role);
      cy.visit('/');
      cy.contains('Acesso restrito').should('be.visible');
    });
  });
});
