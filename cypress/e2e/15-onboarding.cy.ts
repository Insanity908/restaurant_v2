const NEW_TENANT_ID = '22222222-2222-2222-2222-222222222222';

describe('Onboarding (admin, pós-signup)', () => {
  beforeEach(() => {
    cy.intercept('GET', '**/rest/v1/staff?*', { statusCode: 200, body: [] });
  });

  it('admin que já tem restaurante é redireccionado para o dashboard ao visitar /onboarding', () => {
    // Multi-unidade fica para o futuro: quem já tem um restaurante não tem
    // motivo para voltar a esta página (nem para criar outro) — ver
    // OnboardingPage.tsx.
    cy.loginAs('admin');
    cy.visit('/onboarding');
    cy.location('pathname', { timeout: 10000 }).should('eq', '/');
  });

  describe('admin recém-confirmado, ainda sem nenhum restaurante', () => {
    /**
     * Percorre o passo 1 de verdade (login sem tenant → escreve o nome →
     * "Criar" → bootstrap-tenant → reload) em vez de simular um tenant já
     * existente à partida: o guard de OnboardingPage só deixa passar por
     * esse reload quem acabou mesmo de criar o primeiro restaurante (ver
     * JUST_ONBOARDED_KEY em OnboardingPage.tsx), por isso o passo 2 só é
     * alcançável seguindo o fluxo real.
     */
    const createFirstRestaurant = () => {
      cy.loginAs('admin');
      // loginAs('admin') simula um admin com restaurante — para testar o
      // fallback de recuperação (sessão confirmada mas bootstrap-tenant
      // ainda não correu), começamos de zero tenants.
      cy.intercept('GET', '**/rest/v1/tenant_members?*', { statusCode: 200, body: [] });
      cy.intercept('GET', '**/rest/v1/user_roles?*', { statusCode: 200, body: [] });
      cy.intercept('GET', '**/rest/v1/tenants?*', { statusCode: 200, body: [] });
      // tenantStore.getAll() lê de localStorage['tenants'] de forma síncrona
      // (ver src/lib/tenants.ts) — o cy.session partilhado com o outro teste
      // deste ficheiro deixa aí a lista de tenants desse teste anterior, e
      // os intercepts sozinhos não bastam para a limpar.
      cy.window().then(win => {
        win.localStorage.removeItem('tenants');
        win.localStorage.removeItem('current_tenant_id');
      });

      cy.intercept('POST', '**/functions/v1/bootstrap-tenant', {
        statusCode: 200, body: { ok: true, tenantId: NEW_TENANT_ID },
      }).as('bootstrap');
      // Depois de criar, a página recarrega — o tenant novo já tem de
      // aparecer nestas respostas para o passo 1 ficar concluído.
      cy.intercept('GET', '**/rest/v1/tenants?*', {
        statusCode: 200,
        body: [{ id: NEW_TENANT_ID, name: 'Sabor de Maputo', owner_email: 'admin@teste.mz', owner_phone: null, license_key: 'lic1', created_at: new Date().toISOString() }],
      });
      cy.intercept('GET', '**/rest/v1/tenant_members?*', { statusCode: 200, body: [{ tenant_id: NEW_TENANT_ID }] });
      cy.intercept('GET', '**/rest/v1/user_roles?*', { statusCode: 200, body: [{ role: 'admin', tenant_id: NEW_TENANT_ID }] });
      cy.intercept('GET', '**/rest/v1/subscriptions?*', {
        statusCode: 200,
        body: [{ tenant_id: NEW_TENANT_ID, plan: null, status: 'trial', started_at: new Date().toISOString(), expires_at: new Date(Date.now() + 5 * 86400000).toISOString(), blocked_by_admin: false, block_reason: null }],
      });

      cy.visit('/onboarding');
      cy.get('input[placeholder="Ex: Sabor de Maputo"]').type('Sabor de Maputo');
      cy.contains('button', /^criar$/i).click();
      cy.wait('@bootstrap').its('request.body').should('include', { restaurantName: 'Sabor de Maputo', additional: true });
      // addExtraTenant recarrega a página ~400ms depois de criar.
      cy.contains('button', /continuar/i, { timeout: 10000 }).should('be.enabled');
    };

    it('avança para o passo 2 (Equipa) depois de criar o restaurante', () => {
      createFirstRestaurant();
      cy.contains('button', /continuar/i).click();
      cy.contains('h2', /convidar membros da equipa/i).should('be.visible');
    });

    it('DADOS INCORRECTOS: dois membros com o mesmo username são rejeitados', () => {
      createFirstRestaurant();
      cy.contains('button', /continuar/i).click(); // avança para o passo 2 (Equipa)

      cy.contains('button', /adicionar membro/i).click();
      cy.get('input[placeholder="Maria João"]').eq(0).type('Ana');
      cy.get('input[placeholder="maria_caixa"]').eq(0).type('mesmo_user');
      cy.get('input[placeholder="maria@restaurante.mz"]').eq(0).type('ana@teste.mz');
      cy.get('input[placeholder="mín. 8 caracteres"]').eq(0).type('senhaForte123');
      cy.get('input[placeholder="Maria João"]').eq(1).type('Bruno');
      cy.get('input[placeholder="maria_caixa"]').eq(1).type('mesmo_user');
      cy.get('input[placeholder="maria@restaurante.mz"]').eq(1).type('bruno@teste.mz');
      cy.get('input[placeholder="mín. 8 caracteres"]').eq(1).type('senhaForte123');

      cy.contains('button', /concluir/i).click();
      cy.contains(/usernames repetidos/i).should('be.visible');
      cy.location('pathname').should('eq', '/onboarding'); // não avançou
    });

    it('convida um membro válido e conclui, terminando no dashboard', () => {
      createFirstRestaurant();
      const NEW_STAFF_ID = 'a1000000-0000-0000-0000-00000000a998';
      cy.intercept('POST', '**/functions/v1/create-staff-account', {
        statusCode: 200, body: { ok: true, userId: NEW_STAFF_ID },
      }).as('createAccount');
      cy.intercept('POST', '**/rest/v1/staff*', { statusCode: 201, body: [] }).as('postStaff');

      cy.contains('button', /continuar/i).click();

      cy.get('input[placeholder="Maria João"]').first().type('Carla Cozinha');
      cy.get('input[placeholder="maria_caixa"]').first().type('carla_cozinha');
      cy.get('input[placeholder="maria@restaurante.mz"]').first().type('carla@teste.mz');
      cy.get('input[placeholder="mín. 8 caracteres"]').first().type('senhaForte123');

      cy.contains('button', /concluir/i).click();
      cy.wait('@createAccount').its('request.body').should('include', { name: 'Carla Cozinha', username: 'carla_cozinha', email: 'carla@teste.mz' });
      cy.wait('@postStaff').its('request.body').should('include', { id: NEW_STAFF_ID, name: 'Carla Cozinha' });
      cy.location('pathname', { timeout: 10000 }).should('eq', '/');
    });

    it('"Saltar" no passo 2 vai directo para o dashboard sem convidar ninguém', () => {
      createFirstRestaurant();
      cy.contains('button', /continuar/i).click();
      cy.contains('button', /^saltar$/i).click();
      cy.location('pathname').should('eq', '/');
    });
  });
});

export {};
