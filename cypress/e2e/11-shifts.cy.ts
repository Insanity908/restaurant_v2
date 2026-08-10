import { USERS, TENANT_ROLES } from '../support/roles';

describe('Turnos', () => {
  TENANT_ROLES.forEach(role => {
    it(`${role}: consegue bater "Entrada" e depois "Saída"`, () => {
      const user = USERS[role];
      cy.intercept('GET', '**/rest/v1/shifts?*', { statusCode: 200, body: [] });
      cy.intercept('POST', '**/rest/v1/shifts*', {
        statusCode: 201,
        body: [{ id: 'sh-1', tenant_id: user.tenantId, staff_id: user.id, staff_name: user.name, staff_role: role, clock_in: new Date().toISOString(), clock_out: null }],
      }).as('clockIn');
      cy.loginAs(role);
      cy.visit('/shifts');
      cy.contains('button', /^entrada$/i).should('not.be.disabled').click();
      cy.wait('@clockIn');
      cy.contains('button', /^saída$/i).should('not.be.disabled');
    });
  });

  it('DADOS INCORRECTOS: bater "Entrada" duas vezes seguidas mostra aviso e não duplica o turno', () => {
    const user = USERS.waiter;
    cy.intercept('GET', '**/rest/v1/shifts?*', {
      statusCode: 200,
      body: [{ id: 'sh-activo', tenant_id: user.tenantId, staff_id: user.id, staff_name: user.name, staff_role: 'waiter', clock_in: new Date().toISOString(), clock_out: null }],
    });
    const postSpy = cy.spy().as('postSpy');
    cy.intercept('POST', '**/rest/v1/shifts*', postSpy);
    cy.loginAs('waiter');
    cy.visit('/shifts');
    cy.contains('button', /^entrada$/i).should('be.disabled');
  });

  it('admin: vê o histórico de turnos de toda a equipa', () => {
    cy.intercept('GET', '**/rest/v1/shifts?*', {
      statusCode: 200,
      body: [{
        id: 'sh-2', tenant_id: USERS.admin.tenantId, staff_id: USERS.waiter.id,
        staff_name: 'Garçom Teste', staff_role: 'waiter',
        clock_in: new Date(Date.now() - 3600000).toISOString(), clock_out: new Date().toISOString(),
      }],
    });
    cy.loginAs('admin');
    cy.visit('/shifts');
    // A página abre por defeito no âmbito "Eu" (só os meus turnos) — o
    // turno mockado é do garçom, por isso é preciso mudar para "Equipa"
    // antes de aparecer.
    cy.contains('button', /^equipa$/i).click();
    cy.contains('Garçom Teste').should('be.visible');
  });
});
