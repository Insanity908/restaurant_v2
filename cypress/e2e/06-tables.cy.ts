const TABLE = {
  // Tem de ser um UUID válido: store.ts só sincroniza escritas (PATCH/DELETE)
  // quando isUuid(id) é verdadeiro — um id "de leitura fácil" como
  // 't-0001' faz a app ignorar sempre a sincronização, e os testes de
  // editar/remover nunca veem o pedido de rede esperado.
  id: 'a0000000-0000-0000-0000-00000000a001', tenant_id: '11111111-1111-1111-1111-111111111111',
  number: 3, seats: 4, status: 'free', current_order_id: null,
};

describe('Mesas', () => {
  beforeEach(() => {
    cy.intercept('GET', '**/rest/v1/restaurant_tables?*', { statusCode: 200, body: [TABLE] }).as('getTables');
    cy.intercept('GET', '**/rest/v1/orders?*', { statusCode: 200, body: [] });
  });

  it('kitchen: não tem acesso a Mesas (fora da sua área)', () => {
    cy.loginAs('kitchen');
    cy.visit('/tables', { failOnStatusCode: false });
    cy.contains('Acesso restrito').should('be.visible');
  });

  it('waiter: vê as mesas mas não tem botões de editar/remover', () => {
    cy.loginAs('waiter');
    cy.visit('/tables');
    cy.wait('@getTables');
    cy.contains('Mesa 3').should('be.visible');
    cy.get('[title="Editar mesa"]').should('not.exist');
  });

  it('admin: cria uma nova mesa', () => {
    cy.loginAs('admin');
    cy.intercept('POST', '**/rest/v1/restaurant_tables*', {
      statusCode: 201, body: [{ ...TABLE, id: 't-nova', number: 4, seats: 2 }],
    }).as('postTable');
    cy.visit('/tables');
    cy.wait('@getTables');
    cy.contains('button', /nova mesa/i).click();
    cy.get('#table-number').clear().type('4');
    cy.get('#table-seats').clear().type('2');
    cy.contains('button', /^guardar$/i).click();
    cy.wait('@postTable').its('request.body').should('include', { number: 4, seats: 2, status: 'free' });
  });

  it('DADOS INCORRECTOS: não deixa criar uma mesa com um número já existente', () => {
    cy.loginAs('admin');
    cy.visit('/tables');
    cy.wait('@getTables');
    cy.contains('button', /nova mesa/i).click();
    cy.get('#table-number').clear().type('3'); // já existe (TABLE.number = 3)
    cy.contains(/já existe uma mesa com este número/i).should('be.visible');
    cy.contains('button', /^guardar$/i).should('be.disabled');
  });

  it('manager: edita uma mesa existente', () => {
    cy.loginAs('manager');
    cy.intercept('PATCH', '**/rest/v1/restaurant_tables?*', { statusCode: 200, body: [{ ...TABLE, seats: 8 }] }).as('patchTable');
    cy.visit('/tables');
    cy.wait('@getTables');
    cy.get('[title="Editar mesa"]').click();
    cy.get('#table-seats').clear().type('8');
    cy.contains('button', /^guardar$/i).click();
    cy.wait('@patchTable').its('request.body').should('include', { seats: 8 });
  });

  it('admin: não consegue remover uma mesa ocupada', () => {
    // Reatribuir o alias 'getTables': sem isto, este intercept (mais
    // recente que o do beforeEach) responde ao pedido mas cy.wait('@getTables')
    // nunca vê nada, porque o alias original nunca chega a ser usado.
    // Id próprio (não o TABLE partilhado pelos outros testes do ficheiro):
    // evita qualquer escrita pendente residual de um teste anterior sobre o
    // mesmo id interferir com este cenário.
    cy.intercept('GET', '**/rest/v1/restaurant_tables?*', {
      statusCode: 200,
      body: [{ ...TABLE, id: 'a0000000-0000-0000-0000-00000000a099', status: 'occupied' }],
    }).as('getTables');
    cy.loginAs('admin');
    // A sessão 'admin' em cache (cy.session) pode ter uma cópia local de
    // 'tables' de um teste anterior neste ficheiro. Sem isto, essa cópia
    // residual (não ocupada) pode ser o que realmente é clicado, apagando
    // a mesa em vez de bloquear — independentemente do fetch fresco abaixo.
    cy.window().then(win => {
      Object.keys(win.localStorage)
        .filter(k => k.endsWith('__tables') || k === 'sync_outbox_v1')
        .forEach(k => win.localStorage.removeItem(k));
    });
    cy.visit('/tables');
    cy.wait('@getTables');
    // cy.wait() só confirma a resposta de rede — não que o React já
    // re-renderizou com ela. Sem isto, o clique pode apanhar um render
    // efémero anterior (ex: sessão em cache com um fetch incidental
    // "free"), levando a app a apagar a mesa em vez de bloquear.
    cy.contains('Ocupada').should('be.visible');
    cy.get('[title="Remover mesa"]').click();
    cy.contains(/não é possível remover uma mesa ocupada/i).should('be.visible');
  });

  it('FALHA DE REDE: erro ao carregar mesas não deixa a página em branco/travada', () => {
    cy.intercept('GET', '**/rest/v1/restaurant_tables?*', { statusCode: 500, body: { message: 'erro' } }).as('getTablesFail');
    cy.loginAs('admin');
    cy.visit('/tables');
    cy.wait('@getTablesFail');
    cy.contains(/nova mesa/i).should('be.visible'); // a página continua funcional
  });
});

export {};
