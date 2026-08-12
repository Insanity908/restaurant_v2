import { USERS, ROLE_HOME, ALL_ROLES } from '../support/roles';

describe('Login', () => {
  beforeEach(() => {
    cy.mockSupabaseBaseline();
  });

  ALL_ROLES.forEach(role => {
    it(`${role}: login com email correcto redirecciona para ${ROLE_HOME[role]}`, () => {
      const user = USERS[role];
      cy.mockSessionForUser(user);
      cy.intercept('POST', '**/auth/v1/token?grant_type=password', {
        statusCode: 200,
        body: {
          access_token: 'header.' + btoa(JSON.stringify({ sub: user.id })) + '.sig',
          token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600,
          refresh_token: 'r', user: { id: user.id, email: user.email, aud: 'authenticated', role: 'authenticated', user_metadata: { name: user.name } },
        },
      }).as('signIn');

      cy.visit('/login');
      cy.get('#login-identifier').type(user.email);
      cy.get('#login-password').type(user.password);
      cy.contains('button', /entrar/i).click();
      // Autenticação e redireccionamento são validados em separado: primeiro
      // que o pedido de login ocorreu e teve sucesso (falha aqui = problema
      // de autenticação)...
      cy.wait('@signIn').its('response.statusCode').should('eq', 200);
      // ...só depois para onde a app navegou (falha aqui = problema de
      // routing/permissões, não de login) — isto vale tanto para admin como
      // para manager, que partilham o mesmo destino '/'.
      cy.location('pathname', { timeout: 10000 }).should('eq', ROLE_HOME[role]);
    });
  });

  it('login com username (em vez de email) resolve para o email certo e entra', () => {
    // admin fica de fora de propósito — só entra com email (ver teste
    // abaixo). Usa-se manager aqui para cobrir o caminho de username normal.
    const user = USERS.manager;
    cy.mockSessionForUser(user);
    // Corpo tem de ser JSON válido: esta RPC devolve um scalar (text) e o
    // postgrest-js faz sempre JSON.parse(body) na resposta. Uma string JS
    // "crua" aqui é enviada verbatim pelo cy.intercept — sem aspas — logo
    // não é JSON válido, e o postgrest-js devolve erro de parse em vez do
    // email, fazendo loginWithPassword abortar antes de sequer chamar
    // signInWithPassword (era por isto que cy.wait('@signIn') nunca via
    // nenhum pedido: a app nunca chegava a fazê-lo).
    cy.intercept('POST', '**/rest/v1/rpc/resolve_login_email', { statusCode: 200, body: JSON.stringify(user.email) }).as('resolve');
    cy.intercept('POST', '**/auth/v1/token?grant_type=password', (req) => {
      expect(req.body.email).to.eq(user.email);
      req.reply({
        statusCode: 200,
        body: {
          access_token: 'a.b.c', token_type: 'bearer', expires_in: 3600,
          expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'r',
          user: { id: user.id, email: user.email, aud: 'authenticated', role: 'authenticated', user_metadata: {} },
        },
      });
    }).as('signIn');

    cy.visit('/login');
    cy.get('#login-identifier').type(user.username);
    cy.get('#login-password').type(user.password);
    cy.contains('button', /entrar/i).click();
    cy.wait('@resolve');
    // Autenticação e redireccionamento validados separadamente: primeiro
    // confirma-se que o pedido de login ocorreu e teve sucesso...
    cy.wait('@signIn').its('response.statusCode').should('eq', 200);
    // ...só depois se valida para onde a app navegou.
    cy.location('pathname', { timeout: 10000 }).should('eq', ROLE_HOME.manager);
  });

  it('admin: login com username é rejeitado (resolve_login_email devolve null) e pede email', () => {
    const user = USERS.admin;
    // No servidor, resolve_login_email exclui explicitamente quem tem papel
    // 'admin' — devolve null mesmo que o username exista, forçando login por
    // email.
    cy.intercept('POST', '**/rest/v1/rpc/resolve_login_email', { statusCode: 200, body: null }).as('resolve');
    const signIn = cy.spy().as('signInSpy');
    cy.intercept('POST', '**/auth/v1/token?grant_type=password', signIn);

    cy.visit('/login');
    cy.get('#login-identifier').type(user.username);
    cy.get('#login-password').type(user.password);
    cy.contains('button', /entrar/i).click();
    cy.wait('@resolve');
    cy.contains(/utilizador não encontrado/i).should('be.visible');
    cy.get('@signInSpy').should('not.have.been.called');
    cy.location('pathname').should('eq', '/login');
  });

  it('DADOS INCORRECTOS: username inexistente mostra erro e não chega a autenticar', () => {
    cy.intercept('POST', '**/rest/v1/rpc/resolve_login_email', { statusCode: 200, body: null }).as('resolve');
    const signIn = cy.spy().as('signInSpy');
    cy.intercept('POST', '**/auth/v1/token?grant_type=password', signIn);

    cy.visit('/login');
    cy.get('#login-identifier').type('utilizador_que_nao_existe');
    cy.get('#login-password').type('qualquercoisa123');
    cy.contains('button', /entrar/i).click();
    cy.wait('@resolve');
    cy.contains(/utilizador não encontrado/i).should('be.visible');
    cy.get('@signInSpy').should('not.have.been.called');
    cy.location('pathname').should('eq', '/login');
  });

  it('DADOS INCORRECTOS: password errada mostra a mensagem de erro do Supabase e mantém-se em /login', () => {
    cy.intercept('POST', '**/auth/v1/token?grant_type=password', {
      statusCode: 400,
      body: { error: 'invalid_grant', error_description: 'Invalid login credentials' },
    }).as('signInFail');

    cy.visit('/login');
    cy.get('#login-identifier').type(USERS.admin.email);
    cy.get('#login-password').type('password-errada-123');
    cy.contains('button', /entrar/i).click();
    cy.wait('@signInFail');
    cy.contains(/invalid login credentials|credenciais inválidas/i).should('be.visible');
    cy.location('pathname').should('eq', '/login');
  });

  it('DADOS INCORRECTOS: campos vazios não submetem (validação HTML5 required)', () => {
    cy.visit('/login');
    cy.contains('button', /entrar/i).click();
    cy.get('#login-identifier:invalid').should('exist');
    cy.location('pathname').should('eq', '/login');
  });

  it('FALHA DE REDE: erro 500 do servidor de autenticação mostra mensagem e não trava a UI', () => {
    cy.intercept('POST', '**/auth/v1/token?grant_type=password', {
      statusCode: 500,
      body: { error: 'internal_server_error', error_description: 'Erro interno' },
    }).as('signInError');

    cy.visit('/login');
    cy.get('#login-identifier').type(USERS.admin.email);
    cy.get('#login-password').type(USERS.admin.password);
    cy.contains('button', /entrar/i).click();
    cy.wait('@signInError');
    cy.contains('button', /entrar/i).should('not.be.disabled');
    cy.location('pathname').should('eq', '/login');
  });

  it('utilizador já autenticado que visita /login é redireccionado imediatamente (sem ver o formulário)', () => {
    cy.loginAs('cashier');
    cy.visit('/login');
    cy.location('pathname').should('eq', ROLE_HOME.cashier);
  });
});
