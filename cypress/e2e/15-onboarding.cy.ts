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

  it('DADOS INCORRECTOS: dois membros com o mesmo PIN são rejeitados', () => {
    cy.loginAs('admin');
    cy.visit('/onboarding');
    cy.contains('button', /continuar/i).click(); // avança para o passo 2 (Equipa)

    cy.contains('button', /adicionar membro/i).click();
    cy.get('input[placeholder="Maria João"]').eq(0).type('Ana');
    cy.get('input[placeholder="0000"]').eq(0).type('1234');
    cy.get('input[placeholder="Maria João"]').eq(1).type('Bruno');
    cy.get('input[placeholder="0000"]').eq(1).type('1234');

    cy.contains('button', /concluir/i).click();
    cy.contains(/pin 1234 duplicado ou já em uso/i).should('be.visible');
    cy.location('pathname').should('eq', '/onboarding'); // não avançou
  });

  it('admin: convida um membro válido e conclui, terminando em /pricing', () => {
    cy.intercept('POST', '**/rest/v1/staff*', { statusCode: 201, body: [] }).as('postStaff');
    cy.loginAs('admin');
    cy.visit('/onboarding');
    cy.contains('button', /continuar/i).click();

    cy.get('input[placeholder="Maria João"]').first().type('Carla Cozinha');
    cy.get('input[placeholder="0000"]').first().type('9876');

    cy.contains('button', /concluir/i).click();
    cy.wait('@postStaff').its('request.body').should('include', { name: 'Carla Cozinha', pin: '9876' });
    cy.location('pathname', { timeout: 10000 }).should('eq', '/pricing');
  });

  it('admin: "Saltar" no passo 2 vai directo para /pricing sem convidar ninguém', () => {
    cy.loginAs('admin');
    cy.visit('/onboarding');
    cy.contains('button', /continuar/i).click();
    cy.contains('button', /^saltar$/i).click();
    cy.location('pathname').should('eq', '/pricing');
  });
});

export {};
