const TENANT_ID = '11111111-1111-1111-1111-111111111111';

describe('Onboarding (admin, pós-signup)', () => {
  beforeEach(() => {
    cy.intercept('GET', '**/rest/v1/staff?*', { statusCode: 200, body: [] });
  });

  it('admin: cria uma unidade extra através da edge function bootstrap-tenant', () => {
    cy.intercept('POST', '**/functions/v1/bootstrap-tenant', {
      statusCode: 200, body: { ok: true, tenantId: '22222222-2222-2222-2222-222222222222' },
    }).as('bootstrap');
    cy.intercept('GET', '**/rest/v1/tenants?*', {
      statusCode: 200,
      body: [
        { id: TENANT_ID, name: 'Restaurante de Teste', owner_email: 'admin@teste.mz', owner_phone: null, license_key: 'lic1', created_at: new Date().toISOString() },
        { id: '22222222-2222-2222-2222-222222222222', name: 'Sabor de Maputo', owner_email: 'admin@teste.mz', owner_phone: null, license_key: 'lic2', created_at: new Date().toISOString() },
      ],
    });

    cy.loginAs('admin');
    cy.visit('/onboarding');
    cy.get('input[placeholder="Ex: Sabor de Maputo"]').type('Sabor de Maputo');
    cy.contains('button', /^criar$/i).click();
    cy.wait('@bootstrap').its('request.body').should('include', { restaurantName: 'Sabor de Maputo', additional: true });
  });

  it('DADOS INCORRECTOS: dois membros com o mesmo username são rejeitados', () => {
    cy.loginAs('admin');
    cy.visit('/onboarding');
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

  it('admin: convida um membro válido e conclui, terminando no dashboard', () => {
    const NEW_STAFF_ID = 'a1000000-0000-0000-0000-00000000a998';
    cy.intercept('POST', '**/functions/v1/create-staff-account', {
      statusCode: 200, body: { ok: true, userId: NEW_STAFF_ID },
    }).as('createAccount');
    cy.intercept('POST', '**/rest/v1/staff*', { statusCode: 201, body: [] }).as('postStaff');
    cy.loginAs('admin');
    cy.visit('/onboarding');
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

  it('admin: "Saltar" no passo 2 vai directo para o dashboard sem convidar ninguém', () => {
    cy.loginAs('admin');
    cy.visit('/onboarding');
    cy.contains('button', /continuar/i).click();
    cy.contains('button', /^saltar$/i).click();
    cy.location('pathname').should('eq', '/');
  });
});

export {};
