describe('Conta bloqueada / expirada', () => {
  it('admin com subscrição "blocked": é redireccionado para /blocked ao visitar qualquer página de tenant', () => {
    cy.loginAs('admin');
    cy.intercept('GET', '**/rest/v1/subscriptions?*', {
      statusCode: 200,
      body: [{
        tenant_id: '11111111-1111-1111-1111-111111111111', plan: 'monthly', status: 'blocked',
        started_at: new Date().toISOString(), expires_at: new Date(Date.now() - 86400000).toISOString(),
        blocked_by_admin: true, block_reason: 'Pagamento em atraso',
      }],
    });
    cy.visit('/tables');
    cy.location('pathname', { timeout: 10000 }).should('eq', '/blocked');
    cy.contains('Pagamento em atraso').should('be.visible');
    cy.contains('a', /renovar agora/i).should('not.exist'); // status "blocked" não mostra renovar, só "expired"
  });

  it('admin com subscrição "expired": vê o botão de renovar', () => {
    cy.loginAs('admin');
    cy.intercept('GET', '**/rest/v1/subscriptions?*', {
      statusCode: 200,
      body: [{
        tenant_id: '11111111-1111-1111-1111-111111111111', plan: 'monthly', status: 'expired',
        started_at: new Date().toISOString(), expires_at: new Date(Date.now() - 86400000).toISOString(),
        blocked_by_admin: false, block_reason: null,
      }],
    });
    cy.visit('/tables');
    cy.location('pathname', { timeout: 10000 }).should('eq', '/blocked');
    cy.contains('a', /renovar agora/i).should('be.visible').click();
    cy.location('pathname').should('eq', '/pricing');
  });

  it('/billing continua acessível mesmo com a conta bloqueada (para poder pagar)', () => {
    cy.loginAs('admin');
    cy.intercept('GET', '**/rest/v1/subscriptions?*', {
      statusCode: 200,
      body: [{ tenant_id: '11111111-1111-1111-1111-111111111111', plan: 'monthly', status: 'blocked', blocked_by_admin: true, block_reason: 'x', expires_at: new Date().toISOString() }],
    });
    cy.visit('/billing');
    cy.location('pathname').should('eq', '/billing');
    cy.contains('Acesso restrito').should('not.exist');
  });
});

describe('Página não encontrada (404)', () => {
  it('rota inexistente mostra a página 404 em vez de rebentar', () => {
    cy.mockSupabaseBaseline();
    cy.visit('/isto-nao-existe-em-lado-nenhum', { failOnStatusCode: false });
    cy.contains(/página não encontrada|not found|404/i).should('be.visible');
  });

  it('admin autenticado, rota inexistente: também mostra 404 (não rebenta com o layout)', () => {
    cy.loginAs('admin');
    cy.visit('/isto-tambem-nao-existe', { failOnStatusCode: false });
    cy.contains(/página não encontrada|not found|404/i).should('be.visible');
  });
});

export {};
