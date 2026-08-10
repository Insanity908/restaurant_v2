describe('Registo de conta (Signup)', () => {
  beforeEach(() => {
    cy.mockSupabaseBaseline();
    cy.visit('/signup');
  });

  const fillValid = () => {
    cy.fieldByLabel('Nome do restaurante').type('Sabor de Maputo');
    cy.fieldByLabel('O seu nome').type('José Manuel');
    cy.fieldByLabel('Email').type('jose@restaurante.mz');
    cy.fieldByLabel('Telefone').type('841234567');
    cy.fieldByLabel(/^Password$/).type('senhaForte123');
    cy.fieldByLabel('Confirmar password').type('senhaForte123');
  };

  it('DADOS INCORRECTOS: email inválido é rejeitado antes de chamar o Supabase', () => {
    const signUp = cy.spy().as('signUpSpy');
    cy.intercept('POST', '**/auth/v1/signup', signUp);
    fillValid();
    cy.fieldByLabel('Email').clear().type('nao-e-um-email');
    cy.contains('button', /criar conta/i).click();
    cy.contains(/email inválido/i).should('be.visible');
    cy.get('@signUpSpy').should('not.have.been.called');
  });

  it('DADOS INCORRECTOS: password curta é rejeitada', () => {
    fillValid();
    cy.fieldByLabel(/^Password$/).clear().type('123');
    cy.fieldByLabel('Confirmar password').clear().type('123');
    cy.contains('button', /criar conta/i).click();
    cy.contains(/pelo menos 8 caracteres/i).should('be.visible');
  });

  it('DADOS INCORRECTOS: passwords que não coincidem são rejeitadas', () => {
    fillValid();
    cy.fieldByLabel('Confirmar password').clear().type('outraSenhaDiferente');
    cy.contains('button', /criar conta/i).click();
    cy.contains(/não coincidem/i).should('be.visible');
  });

  it('sucesso: cria a conta, chama bootstrap-tenant e navega para /onboarding', () => {
    cy.intercept('POST', '**/auth/v1/signup', {
      statusCode: 200,
      body: {
        access_token: 'a.b.c', token_type: 'bearer', expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'r',
        user: { id: 'new-admin-id', email: 'jose@restaurante.mz', aud: 'authenticated', role: 'authenticated', user_metadata: {} },
      },
    }).as('signUp');
    cy.intercept('GET', '**/auth/v1/user', {
      statusCode: 200,
      body: { id: 'new-admin-id', email: 'jose@restaurante.mz', aud: 'authenticated', role: 'authenticated', user_metadata: {} },
    });
    cy.intercept('POST', '**/functions/v1/bootstrap-tenant', {
      statusCode: 200, body: { ok: true, tenantId: '22222222-0000-0000-0000-000000000000' },
    }).as('bootstrap');
    cy.intercept('GET', '**/rest/v1/profiles?*', { statusCode: 200, body: [{ name: 'José Manuel', email: 'jose@restaurante.mz', phone: '841234567', username: null }] });
    cy.intercept('GET', '**/rest/v1/user_roles?*', { statusCode: 200, body: [{ role: 'admin', tenant_id: '22222222-0000-0000-0000-000000000000' }] });
    cy.intercept('GET', '**/rest/v1/tenant_members?*', { statusCode: 200, body: [{ tenant_id: '22222222-0000-0000-0000-000000000000' }] });

    fillValid();
    cy.contains('button', /criar conta/i).click();
    cy.wait('@signUp');
    cy.wait('@bootstrap').its('request.body').should('include', { restaurantName: 'Sabor de Maputo', ownerName: 'José Manuel' });
    cy.location('pathname', { timeout: 10000 }).should('eq', '/onboarding');
  });

  it('FALHA: se o bootstrap-tenant falhar, mostra erro e NÃO avança para onboarding', () => {
    cy.intercept('POST', '**/auth/v1/signup', {
      statusCode: 200,
      body: {
        access_token: 'a.b.c', token_type: 'bearer', expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'r',
        user: { id: 'new-admin-id-2', email: 'jose2@restaurante.mz', aud: 'authenticated', role: 'authenticated', user_metadata: {} },
      },
    }).as('signUp');
    cy.intercept('POST', '**/functions/v1/bootstrap-tenant', {
      statusCode: 500, body: { error: 'Erro ao criar tenant' },
    }).as('bootstrapFail');

    fillValid();
    cy.fieldByLabel('Email').clear().type('jose2@restaurante.mz');
    cy.contains('button', /criar conta/i).click();
    cy.wait('@signUp');
    cy.wait('@bootstrapFail');
    cy.contains(/falhou provisionar restaurante/i).should('be.visible');
    cy.location('pathname').should('eq', '/signup');
  });
});

export {};
