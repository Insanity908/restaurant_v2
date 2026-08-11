describe('Funcionários', () => {
  (['cashier', 'waiter', 'kitchen'] as const).forEach(role => {
    it(`${role}: SEM acesso a Funcionários`, () => {
      cy.loginAs(role);
      cy.visit('/staff', { failOnStatusCode: false });
      cy.contains('Acesso restrito').should('be.visible');
    });
  });

  it('admin: cria um novo funcionário (conta real via create-staff-account)', () => {
    // UUID válido: store.ts só sincroniza (POST) quando isUuid(id) é
    // verdadeiro, senão cy.wait('@postStaff') nunca vê nada.
    const NEW_STAFF_ID = 'a1000000-0000-0000-0000-00000000a999';
    cy.intercept('GET', '**/rest/v1/staff?*', { statusCode: 200, body: [] });
    cy.intercept('POST', '**/functions/v1/create-staff-account', {
      statusCode: 200, body: { ok: true, userId: NEW_STAFF_ID },
    }).as('createAccount');
    cy.intercept('POST', '**/rest/v1/staff*', { statusCode: 201, body: [] }).as('postStaff');

    cy.loginAs('admin');
    cy.visit('/staff');
    cy.contains('button', /novo funcionário/i).click();
    cy.get('[role="dialog"]').should('be.visible').within(() => {
      cy.get('#name').type('Maria João');
      cy.get('#username').type('maria_caixa');
      cy.get('#staff-email').type('maria@restaurante.mz');
      cy.get('#staff-password').type('senhaForte123');
      cy.contains('button', /adicionar/i).click();
    });
    cy.wait('@createAccount').its('request.body').should('include', {
      name: 'Maria João', username: 'maria_caixa', email: 'maria@restaurante.mz',
    });
    cy.wait('@postStaff').its('request.body').should('include', { id: NEW_STAFF_ID, name: 'Maria João' });
  });

  it('DADOS INCORRECTOS: password curta não chega a chamar a edge function', () => {
    cy.intercept('GET', '**/rest/v1/staff?*', { statusCode: 200, body: [] });
    const invokeSpy = cy.spy().as('invokeSpy');
    cy.intercept('POST', '**/functions/v1/create-staff-account', invokeSpy);
    cy.loginAs('admin');
    cy.visit('/staff');
    cy.contains('button', /novo funcionário/i).click();
    cy.get('[role="dialog"]').within(() => {
      cy.get('#name').type('Teste Curto');
      cy.get('#username').type('teste_curto');
      cy.get('#staff-email').type('teste@restaurante.mz');
      cy.get('#staff-password').type('123');
      cy.contains('button', /adicionar/i).click();
    });
    cy.get('@invokeSpy').should('not.have.been.called');
  });

  it('DADOS INCORRECTOS: username já em uso é rejeitado pelo servidor e mostra erro', () => {
    cy.intercept('GET', '**/rest/v1/staff?*', { statusCode: 200, body: [] });
    cy.intercept('POST', '**/functions/v1/create-staff-account', {
      statusCode: 409, body: { error: 'Username já está em uso' },
    }).as('createFail');
    cy.loginAs('admin');
    cy.visit('/staff');
    cy.contains('button', /novo funcionário/i).click();
    cy.get('[role="dialog"]').within(() => {
      cy.get('#name').type('Outro Funcionário');
      cy.get('#username').type('username_repetido');
      cy.get('#staff-email').type('outro@restaurante.mz');
      cy.get('#staff-password').type('senhaForte123');
      cy.contains('button', /adicionar/i).click();
    });
    cy.wait('@createFail');
    // Não usar .should('be.visible') aqui: com o diálogo ainda aberto,
    // Cypress considera o toast "coberto" pelo overlay do diálogo mesmo
    // quando pinta visualmente por cima (paint order vs. o cálculo de
    // cobertura do Cypress divergem neste caso) — confirmar via conteúdo
    // da região do toast evita esse falso negativo.
    cy.get('[data-sonner-toaster]').should('contain.text', 'Username já está em uso');
  });

  it('manager: "Novo funcionário" não oferece os papéis Administrador/Gerente/Super Admin', () => {
    cy.intercept('GET', '**/rest/v1/staff?*', { statusCode: 200, body: [] });
    cy.loginAs('manager');
    cy.visit('/staff');
    cy.contains('button', /novo funcionário/i).click();
    cy.get('[role="dialog"]').within(() => {
      cy.get('[role="combobox"], select').first().click({ force: true });
    });
    cy.contains('[role="option"]', /administrador/i).should('not.exist');
    cy.contains('[role="option"]', /gerente/i).should('not.exist');
    cy.contains('[role="option"]', /super admin/i).should('not.exist');
  });

  it('"Super Admin" nunca aparece na lista/contagem de papéis desta página', () => {
    cy.intercept('GET', '**/rest/v1/staff?*', { statusCode: 200, body: [] });
    cy.loginAs('admin');
    cy.visit('/staff');
    cy.contains('Super Admin').should('not.exist');
  });
});

export {};
