function tenant(overrides: Record<string, unknown> = {}) {
  return {
    id: 'tenant-abc', name: 'Restaurante Bloqueado', owner_email: 'dono@teste.mz',
    owner_phone: null, license_key: 'lic_abc123', created_at: new Date().toISOString(),
    subscriptions: [{
      plan: 'monthly', status: 'blocked', started_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 5 * 86400000).toISOString(),
      last_payment_ref: null, blocked_by_admin: true, block_reason: 'Pagamento em atraso',
    }],
    subscription_history: [],
    ...overrides,
  };
}

describe('SuperAdmin', () => {
  (['admin', 'manager', 'cashier', 'waiter', 'kitchen'] as const).forEach(role => {
    it(`${role}: SEM acesso a /admin`, () => {
      cy.loginAs(role);
      cy.visit('/admin', { failOnStatusCode: false });
      cy.location('pathname').should('eq', '/');
    });
  });

  it('superadmin: vê a lista de restaurantes e desbloqueia um restaurante bloqueado', () => {
    cy.intercept('GET', '**/rest/v1/tenants?*', { statusCode: 200, body: [tenant()] }).as('getTenants');
    cy.intercept('POST', '**/functions/v1/subscription-status', (req) => {
      expect(req.body).to.include({ action: 'unblock', tenantId: 'tenant-abc' });
      req.reply({ statusCode: 200, body: { ok: true } });
    }).as('unblock');

    cy.loginAs('superadmin');
    cy.visit('/admin');
    cy.wait('@getTenants');
    cy.contains('Restaurante Bloqueado').should('be.visible');
    cy.contains('button', /desbloquear/i).click();
    cy.wait('@unblock');
  });

  it('superadmin: bloqueia um restaurante activo com um motivo', () => {
    const active = tenant({ id: 'tenant-active', name: 'Restaurante Activo', subscriptions: [{ plan: 'monthly', status: 'active', started_at: new Date().toISOString(), expires_at: new Date(Date.now() + 10 * 86400000).toISOString(), last_payment_ref: null, blocked_by_admin: false, block_reason: null }] });
    cy.intercept('GET', '**/rest/v1/tenants?*', { statusCode: 200, body: [active] });
    cy.intercept('POST', '**/functions/v1/subscription-status', (req) => {
      expect(req.body).to.include({ action: 'block', tenantId: 'tenant-active' });
      req.reply({ statusCode: 200, body: { ok: true } });
    }).as('block');

    cy.loginAs('superadmin');
    cy.visit('/admin');
    cy.contains('Restaurante Activo').should('be.visible');
    cy.contains('button', /bloquear/i).click();
    cy.get('[role="dialog"], [role="alertdialog"]').within(() => {
      cy.get('textarea, input').first().type('Falta de pagamento há 2 meses');
      cy.contains('button', /bloquear|confirmar/i).click();
    });
    cy.wait('@block');
  });

  it('superadmin: eliminar restaurante pede confirmação antes de chamar o servidor', () => {
    cy.intercept('GET', '**/rest/v1/tenants?*', { statusCode: 200, body: [tenant()] });
    const deleteSpy = cy.spy().as('deleteSpy');
    cy.intercept('POST', '**/functions/v1/subscription-status', deleteSpy);

    cy.loginAs('superadmin');
    cy.visit('/admin');
    cy.get('[aria-label="Eliminar restaurante"]').click();
    cy.get('[role="alertdialog"]').should('be.visible');
    cy.get('@deleteSpy').should('not.have.been.called');
    cy.get('[role="alertdialog"]').contains('button', /cancelar/i).click();
    cy.get('[role="alertdialog"]').should('not.exist');
  });

  it('superadmin: estende a subscrição em +15 dias', () => {
    cy.intercept('GET', '**/rest/v1/tenants?*', { statusCode: 200, body: [tenant()] });
    cy.intercept('POST', '**/functions/v1/subscription-status', (req) => {
      expect(req.body).to.include({ action: 'extend', tenantId: 'tenant-abc', days: 15 });
      req.reply({ statusCode: 200, body: { ok: true } });
    }).as('extend');

    cy.loginAs('superadmin');
    cy.visit('/admin');
    cy.contains('button', /\+ dias/i).click();
    cy.get('[role="dialog"]').within(() => {
      cy.get('input[type="number"]').clear().type('15');
      cy.contains('button', /^estender$/i).click();
    });
    cy.wait('@extend');
  });

  it('DADOS INCORRECTOS/FALHA: erro do servidor ao desbloquear mostra mensagem e mantém o estado anterior', () => {
    cy.intercept('GET', '**/rest/v1/tenants?*', { statusCode: 200, body: [tenant()] });
    cy.intercept('POST', '**/functions/v1/subscription-status', { statusCode: 500, body: { error: 'Erro interno' } }).as('unblockFail');

    cy.loginAs('superadmin');
    cy.visit('/admin');
    cy.contains('button', /desbloquear/i).click();
    cy.wait('@unblockFail');
    cy.contains(/erro/i).should('be.visible');
    cy.contains('Restaurante Bloqueado').should('be.visible'); // continua na lista
  });
});

export {};
