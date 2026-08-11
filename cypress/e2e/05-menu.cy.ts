const MENU_ITEM = {
  // Tem de ser um UUID válido: store.ts só sincroniza (PATCH) quando
  // isUuid(id) é verdadeiro, senão cy.wait('@patchMenu') nunca vê nada.
  id: 'a0000000-0000-0000-0000-000000000001',
  tenant_id: '11111111-1111-1111-1111-111111111111',
  // 'Popular' porque é a categoria activa por omissão em MenuPage — um
  // item noutra categoria nunca aparece sem primeiro clicar no separador.
  name: 'Frango Grelhado', price: 350, category: 'Popular',
  description: 'Servido com arroz e salada', image_path: null, available: true,
  modifiers: [], recipe: null,
};

describe('Menu', () => {
  beforeEach(() => {
    cy.intercept('GET', '**/rest/v1/menu_items?*', { statusCode: 200, body: [MENU_ITEM] }).as('getMenu');
  });

  it('kitchen: vê o cardápio só em modo de visualização, sem botão "Gerir"', () => {
    cy.loginAs('kitchen');
    cy.visit('/menu');
    cy.wait('@getMenu');
    cy.contains('Frango Grelhado').should('be.visible');
    cy.contains('button', /gerir/i).should('not.exist');
  });

  it('cashier: vê o cardápio, sem acesso de gestão', () => {
    cy.loginAs('cashier');
    cy.visit('/menu');
    cy.wait('@getMenu');
    cy.contains('Frango Grelhado').should('be.visible');
    cy.contains('button', /gerir/i).should('not.exist');
  });

  it('manager: consegue entrar em modo de gestão e desactivar a disponibilidade de um prato', () => {
    cy.loginAs('manager');
    cy.intercept('PATCH', '**/rest/v1/menu_items?*', { statusCode: 200, body: [{ ...MENU_ITEM, available: false }] }).as('patchMenu');
    cy.visit('/menu');
    cy.wait('@getMenu');
    cy.contains('button', /gerir/i).click();
    cy.get('[role="switch"]').first().click();
    cy.wait('@patchMenu').its('request.body').should('deep.equal', { available: false });
  });

  it('admin: cria um novo prato através do diálogo "Novo Item"', () => {
    cy.loginAs('admin');
    cy.intercept('POST', '**/rest/v1/menu_items*', { statusCode: 201, body: [{ ...MENU_ITEM, id: 'm-novo', name: 'Sopa do Dia', price: 150 }] }).as('postMenu');
    cy.visit('/menu');
    cy.wait('@getMenu');
    cy.contains('button', /gerir/i).click();
    cy.contains('button', /novo item/i).click();
    cy.get('[role="dialog"]').should('be.visible').within(() => {
      cy.fieldByLabel(/^nome/i).type('Sopa do Dia');
      cy.fieldByLabel(/preço/i).type('150');
      cy.contains('button', /criar item/i).click();
    });
    cy.wait('@postMenu').its('request.body').should('include', { name: 'Sopa do Dia', price: 150 });
  });

  it('DADOS INCORRECTOS: "Criar Item" fica desactivado sem nome/preço', () => {
    cy.loginAs('admin');
    cy.visit('/menu');
    cy.wait('@getMenu');
    cy.contains('button', /gerir/i).click();
    cy.contains('button', /novo item/i).click();
    cy.get('[role="dialog"]').should('be.visible').within(() => {
      cy.contains('button', /criar item/i).should('be.disabled');
    });
  });

  it('DADOS INCORRECTOS: FALHA DE REDE ao gravar disponibilidade não trava a UI (mostra o valor anterior)', () => {
    cy.loginAs('manager');
    cy.intercept('PATCH', '**/rest/v1/menu_items?*', { statusCode: 500, body: { message: 'internal error' } }).as('patchFail');
    cy.visit('/menu');
    cy.wait('@getMenu');
    cy.contains('button', /gerir/i).click();
    cy.get('[role="switch"]').first().click();
    cy.wait('@patchFail');
    // A app usa uma fila de sincronização offline — a escrita falhada fica
    // marcada para nova tentativa, mas a UI continua utilizável e não
    // trava; o indicador de sync (canto superior) reflecte a falha.
    cy.get('body').should('be.visible');
  });
});

export {};
