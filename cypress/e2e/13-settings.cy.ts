describe('Configurações', () => {
  (['manager', 'cashier', 'waiter', 'kitchen'] as const).forEach(role => {
    it(`${role}: SEM acesso a Configurações`, () => {
      cy.loginAs(role);
      cy.visit('/settings', { failOnStatusCode: false });
      cy.contains('Acesso restrito').should('be.visible');
    });
  });

  it('admin: altera o nome do estabelecimento e guarda', () => {
    cy.intercept('GET', '**/rest/v1/app_settings?*', { statusCode: 200, body: [] });
    cy.intercept('PATCH', '**/rest/v1/app_settings?*', { statusCode: 200, body: [{}] }).as('patchSettings');
    cy.intercept('POST', '**/rest/v1/app_settings*', { statusCode: 201, body: [{}] }).as('postSettings');
    cy.loginAs('admin');
    cy.visit('/settings');
    cy.contains('label', /nome do estabelecimento/i).parent().find('input').clear().type('Sabor de Maputo');
    // O botão principal "Guardar" fica nas acções do cabeçalho da página
    // (PageShell), distinto do botão "Guardar" ao lado do campo de
    // username mais abaixo — por isso usa-se o primeiro da DOM.
    cy.contains('button', /guardar/i).first().click();
    // Sem registo prévio em app_settings (GET devolve []), a app faz um
    // upsert (POST .../app_settings?on_conflict=tenant_id) em vez de PATCH.
    // request.body é {tenant_id, data: {...}} — `.include()` num objecto faz
    // subset match, mas comparar o `data` directamente evita qualquer
    // ambiguidade com as chaves extra (tenant_id) ao lado dele.
    cy.wait('@postSettings').its('request.body.data').should('include', { brandName: 'Sabor de Maputo' });
  });

  it('admin: define um username e usa-o para entrar da próxima vez', () => {
    cy.intercept('GET', '**/rest/v1/app_settings?*', { statusCode: 200, body: [] });
    cy.intercept('PATCH', '**/rest/v1/profiles?*', { statusCode: 200, body: [{}] }).as('patchUsername');
    cy.loginAs('admin');
    cy.visit('/settings');
    // O campo de username fica no separador "Negócio", não no separador
    // por defeito ("Marca").
    cy.contains('button', /^negócio$/i).click();
    cy.get('input[placeholder="ex: joao_admin"]').clear().type('admin_novo');
    cy.get('input[placeholder="ex: joao_admin"]').parent().contains('button', /guardar/i).click();
    cy.wait('@patchUsername').its('request.body').should('include', { username: 'admin_novo' });
  });

  it('DADOS INCORRECTOS: username duplicado mostra erro amigável', () => {
    cy.intercept('GET', '**/rest/v1/app_settings?*', { statusCode: 200, body: [] });
    cy.intercept('PATCH', '**/rest/v1/profiles?*', {
      statusCode: 409, body: { message: 'duplicate key value violates unique constraint "idx_profiles_username_lower"' },
    }).as('patchUsernameFail');
    cy.loginAs('admin');
    cy.visit('/settings');
    cy.contains('button', /^negócio$/i).click();
    cy.get('input[placeholder="ex: joao_admin"]').clear().type('username_ja_existe');
    cy.get('input[placeholder="ex: joao_admin"]').parent().contains('button', /guardar/i).click();
    cy.wait('@patchUsernameFail');
    cy.contains(/já está em uso/i).should('be.visible');
  });
});

export {};
