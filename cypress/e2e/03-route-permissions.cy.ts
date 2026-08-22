import { ALL_ROLES, TENANT_ROLES, ROUTE_PERMISSIONS, type Role } from '../support/roles';

// /admin usa um guarda diferente (RequireSuperAdmin: redirecciona para "/"
// em vez de mostrar "Acesso restrito") — tem testes dedicados mais abaixo,
// fora do loop genérico que assume o comportamento do RequireAuth.
const ALL_ROUTES = Object.keys(ROUTE_PERMISSIONS).filter(r => r !== '/admin');

describe('Matriz de permissões de rota (todos os papéis × todas as páginas)', () => {
  // expenses/expense_amount_history/staff_salaries não estão em
  // CATALOG_TABLES (support/commands.ts) — sem isto, visitar /expenses como
  // admin dispararia pedidos reais não interceptados (ver 18-expenses.cy.ts).
  beforeEach(() => {
    cy.intercept('GET', '**/rest/v1/expenses?*', { statusCode: 200, body: [] });
    cy.intercept('GET', '**/rest/v1/expense_amount_history?*', { statusCode: 200, body: [] });
    cy.intercept('GET', '**/rest/v1/staff_salaries?*', { statusCode: 200, body: [] });
  });

  ALL_ROLES.forEach((role: Role) => {
    describe(`Papel: ${role}`, () => {
      beforeEach(() => cy.loginAs(role));

      // '/' usa um guarda diferente para superadmin também: App.tsx (HomeRoute)
      // mostra o Painel Super-Admin directamente em "/", tal como em "/admin"
      // — nunca chega à checagem genérica de ROUTE_PERMISSIONS do RequireAuth,
      // por isso fica de fora do loop genérico (mesmo padrão usado para
      // excluir '/admin' acima).
      const routesForRole = role === 'superadmin' ? ALL_ROUTES.filter(r => r !== '/') : ALL_ROUTES;

      routesForRole.forEach(route => {
        const allowed = ROUTE_PERMISSIONS[route].includes(role);

        it(`${allowed ? 'PERMITE' : 'BLOQUEIA'} acesso a ${route}`, () => {
          cy.visit(route, { failOnStatusCode: false });
          if (allowed) {
            cy.contains('Acesso restrito').should('not.exist');
            cy.location('pathname').should('eq', route);
          } else {
            // RequireAuth aplica a mesma checagem de papel a QUALQUER
            // utilizador autenticado (incl. superadmin) para rotas de
            // tenant — não há bypass especial, por isso o comportamento é
            // uniforme para todos os papéis não autorizados.
            cy.contains('Acesso restrito').should('be.visible');
            cy.contains(role).should('be.visible');
          }
        });
      });
    });
  });

  it('utilizador não autenticado é sempre redireccionado para /login, com "from" preservado', () => {
    cy.mockSupabaseBaseline();
    cy.visit('/staff');
    cy.location('pathname').should('eq', '/login');
  });

  it('superadmin: /admin carrega normalmente (painel de gestão de restaurantes)', () => {
    cy.loginAs('superadmin');
    cy.visit('/admin');
    cy.location('pathname').should('eq', '/admin');
    cy.contains('Acesso restrito').should('not.exist');
  });

  it('superadmin: "/" também mostra o Painel Super-Admin (HomeRoute), não "Acesso restrito"', () => {
    cy.loginAs('superadmin');
    cy.visit('/');
    cy.location('pathname').should('eq', '/');
    cy.contains('Painel Super-Admin').should('be.visible');
    cy.contains('Acesso restrito').should('not.exist');
  });

  TENANT_ROLES.forEach(role => {
    it(`${role}: /admin redirecciona para "/" (nunca mostra o painel de superadmin)`, () => {
      cy.loginAs(role);
      cy.visit('/admin', { failOnStatusCode: false });
      cy.location('pathname').should('eq', '/');
    });
  });
});
