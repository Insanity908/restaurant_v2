import { USERS, ROLE_HOME, type Role, type TestUser } from './roles';

// =============================================================================
// Nenhum destes testes toca a rede real. Tudo o que o supabase-js tentaria
// enviar (auth, REST, RPC, edge functions) é interceptado aqui. Isto
// significa que os testes correm sem depender de um projecto Supabase real
// — mas também significa que NÃO testam as políticas RLS reais (isso já foi
// validado à parte, directamente em Postgres — ver supabase/schema_clean_install.sql
// e os testes que correram contra ele). Esta suite testa a aplicação: se o
// botão certo aparece para o papel certo, se os formulários validam, se os
// pedidos HTTP que SERIAM enviados têm a forma certa, e como a UI reage a
// respostas de erro.
// =============================================================================

function base64Url(obj: unknown): string {
  const json = JSON.stringify(obj);
  const b64 = btoa(unescape(encodeURIComponent(json)));
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** JWT com forma válida (header.payload.signature) mas não assinado de verdade — chega para o supabase-js persistir e ler a sessão; nenhum dos intercepts abaixo valida a assinatura. */
function fakeAccessToken(user: TestUser): string {
  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = {
    sub: user.id,
    email: user.email,
    role: 'authenticated',
    aud: 'authenticated',
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24,
  };
  return `${base64Url(header)}.${base64Url(payload)}.fake-signature`;
}

function fakeSessionResponse(user: TestUser) {
  return {
    access_token: fakeAccessToken(user),
    token_type: 'bearer',
    expires_in: 60 * 60 * 24,
    expires_at: Math.floor(Date.now() / 1000) + 60 * 60 * 24,
    refresh_token: 'fake-refresh-token',
    user: {
      id: user.id,
      aud: 'authenticated',
      role: 'authenticated',
      email: user.email,
      user_metadata: { name: user.name },
      app_metadata: {},
    },
  };
}

/** Nomes de todas as tabelas que a app lê no arranque de sessão / catálogo do tenant. */
const CATALOG_TABLES = [
  'menu_items', 'restaurant_tables', 'inventory_items', 'customers', 'staff',
  'orders', 'order_items', 'order_events', 'shifts', 'security_alerts',
  'app_settings', 'loyalty_settings', 'staff_permissions', 'system_payment_accounts',
  'tenants', 'tenant_members', 'user_roles', 'subscriptions', 'subscription_history',
];

Cypress.Commands.add('mockSupabaseBaseline', () => {
  // GET por omissão: lista vazia para todas as tabelas de catálogo.
  CATALOG_TABLES.forEach(table => {
    cy.intercept('GET', `**/rest/v1/${table}?*`, { statusCode: 200, body: [] }).as(`get_${table}_default`);
    cy.intercept('POST', `**/rest/v1/${table}*`, { statusCode: 201, body: [] }).as(`post_${table}_default`);
    cy.intercept('PATCH', `**/rest/v1/${table}?*`, { statusCode: 200, body: [] }).as(`patch_${table}_default`);
    cy.intercept('DELETE', `**/rest/v1/${table}?*`, { statusCode: 204, body: '' }).as(`delete_${table}_default`);
  });
  cy.intercept('POST', '**/rest/v1/rpc/resolve_login_email', (req) => {
    const identifier = String(req.body?.identifier ?? '').toLowerCase();
    // Espelha o servidor real: 'admin' fica de fora da resolução por
    // username de propósito (só entra com email) — ver migração
    // 20260812193000_block_admin_username_login.sql.
    const match = Object.values(USERS).find(u => u.username.toLowerCase() === identifier && u.role !== 'admin');
    // O corpo tem de ser JSON válido: esta RPC devolve um scalar (text), e o
    // postgrest-js faz sempre JSON.parse(body) na resposta (ver
    // PostgrestBuilder.processResponse). Uma string JS "crua" aqui (ex:
    // `body: match.email`) é enviada verbatim pelo cy.intercept — sem aspas
    // — o que não é JSON válido e faz o postgrest-js devolver um erro de
    // parse em vez do email, abortando o login antes de chegar a
    // signInWithPassword.
    req.reply({ statusCode: 200, body: JSON.stringify(match ? match.email : null) });
  }).as('resolveLoginEmail');
  // useLicense() chama esta edge function (action: "status") em TODAS as
  // páginas de tenant (via RequireLicense), não só na Faturação.
  cy.intercept('POST', '**/functions/v1/subscription-status', { statusCode: 200, body: { ok: true } }).as('subscriptionStatusDefault');
});

Cypress.Commands.add('mockSessionForUser', (user: TestUser) => {
  const roleRows = user.role === 'superadmin'
    ? [{ role: 'superadmin', tenant_id: null }]
    : [{ role: user.role, tenant_id: user.tenantId }];
  const memberRows = user.tenantId ? [{ tenant_id: user.tenantId }] : [];

  // supabase-js's auth.getUser() (unlike getSession()) always revalidates
  // against the server — with the spec's fake session token that would hit
  // the real Supabase backend and fail, since only 02-signup.cy.ts mocked
  // this endpoint before. Any code path that calls getUser() (e.g.
  // createTenant() in src/lib/tenants.ts, used by "Adicionar outra
  // unidade") needs it mocked here so it isn't specific to one spec.
  cy.intercept('GET', '**/auth/v1/user', {
    statusCode: 200,
    body: { id: user.id, email: user.email, aud: 'authenticated', role: 'authenticated', user_metadata: { name: user.name } },
  }).as('getAuthUser');

  cy.intercept('GET', '**/rest/v1/profiles?*', {
    statusCode: 200,
    body: [{ name: user.name, email: user.email, phone: null, username: user.username }],
  }).as('getProfile');
  cy.intercept('GET', '**/rest/v1/user_roles?*', { statusCode: 200, body: roleRows }).as('getUserRoles');
  cy.intercept('GET', '**/rest/v1/tenant_members?*', { statusCode: 200, body: memberRows }).as('getTenantMembers');

  if (user.tenantId) {
    cy.intercept('GET', '**/rest/v1/tenants?*', {
      statusCode: 200,
      body: [{
        id: user.tenantId, name: 'Restaurante de Teste', owner_email: USERS.admin.email,
        owner_phone: null, license_key: 'lic_teste_0001', created_at: new Date().toISOString(),
      }],
    }).as('getTenant');
    cy.intercept('GET', '**/rest/v1/subscriptions?*', {
      statusCode: 200,
      body: [{
        tenant_id: user.tenantId, plan: null, status: 'trial',
        started_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 5 * 86400000).toISOString(),
        blocked_by_admin: false, block_reason: null,
      }],
    }).as('getSubscription');
  }
});

/**
 * Autentica como o papel dado, passando pelo ecrã de login REAL (escreve
 * email/username + password, submete o formulário) tal como um utilizador
 * faria — não injecta a sessão directamente no localStorage. Usa
 * `cy.session()` para não repetir isto em cada teste do mesmo ficheiro.
 */
Cypress.Commands.add('loginAs', (role: Role, opts: { useUsername?: boolean } = {}) => {
  const user = USERS[role];

  cy.session(
    [role, opts.useUsername ? 'username' : 'email'],
    () => {
      // Os mocks genéricos (catálogo vazio, resolve_login_email,
      // subscription-status) já foram registados pelo beforeEach global em
      // support/e2e.ts, ANTES do corpo do teste começar — não os repetimos
      // aqui para não os registar depois de intercepts específicos que o
      // próprio spec possa ter definido antes de chamar loginAs().
      cy.mockSessionForUser(user);

      cy.intercept('POST', '**/auth/v1/token?grant_type=password', {
        statusCode: 200,
        body: fakeSessionResponse(user),
      }).as('signIn');

      cy.visit('/login');
      cy.get('#login-identifier').type(opts.useUsername ? user.username : user.email);
      cy.get('#login-password').type(user.password);
      cy.contains('button', /entrar/i).click();
      cy.wait('@signIn');
      cy.location('pathname', { timeout: 10000 }).should('eq', ROLE_HOME[role]);
    },
    {
      validate: () => {
        cy.window().its('localStorage').then((ls: Storage) => {
          const hasSbKey = Object.keys(ls).some(k => k.startsWith('sb-') && k.endsWith('-auth-token'));
          // eslint-disable-next-line @typescript-eslint/no-unused-expressions -- getter de asserção do Chai, não uma expressão morta
          expect(hasSbKey, 'sessão Supabase persistida').to.be.true;
        });
      },
    },
  );

  // Intercepts não sobrevivem entre testes (mesmo com cy.session a
  // restaurar cookies/localStorage) — os dados específicos deste
  // utilizador (perfil/papéis/tenant) têm de ser reaplicados sempre. Os
  // mocks GENÉRICOS de catálogo já estão garantidos pelo beforeEach global.
  cy.mockSessionForUser(user);
});

/**
 * Encontra o <input>/<select>/<textarea> irmão de um <label> com este
 * texto. Vários formulários desta app usam <Label>Texto</Label> seguido do
 * campo como próximo elemento, sem `htmlFor`/`id` a ligá-los (falha de
 * acessibilidade já documentada nos testes de a11y) — por isso não dá para
 * usar um selector "by label" convencional aqui.
 */
Cypress.Commands.add('fieldByLabel', (label: string | RegExp) => {
  return cy.contains('label', label).parent().find('input, select, textarea').first();
});

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Cypress {
    interface Chainable {
      mockSupabaseBaseline(): Chainable<void>;
      mockSessionForUser(user: TestUser): Chainable<void>;
      loginAs(role: Role, opts?: { useUsername?: boolean }): Chainable<void>;
      fieldByLabel(label: string | RegExp): Chainable<JQuery<HTMLElement>>;
    }
  }
}

export {};
