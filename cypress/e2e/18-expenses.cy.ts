import { USERS, TENANT_ID } from '../support/roles';

// expenses/staff_salaries/expense_amount_history não estão em
// CATALOG_TABLES (support/commands.ts) — não são lidas no arranque de
// sessão, só nesta página e em Relatórios — por isso cada teste aqui
// intercepta-as explicitamente em vez de confiar no baseline global.

describe('Despesas', () => {
  // Restrição de acesso (todos os papéis não-admin, incl. superadmin) já é
  // coberta pela matriz genérica em 03-route-permissions.cy.ts — ver
  // ROUTE_PERMISSIONS['/expenses'] em support/roles.ts.

  it('admin: cria uma despesa recorrente (regista também o histórico inicial)', () => {
    cy.intercept('GET', '**/rest/v1/expenses?*', { statusCode: 200, body: [] });
    cy.intercept('GET', '**/rest/v1/staff_salaries?*', { statusCode: 200, body: [] });
    cy.intercept('GET', '**/rest/v1/staff?*', { statusCode: 200, body: [] });
    cy.intercept('POST', '**/rest/v1/expenses*', { statusCode: 201, body: [{}] }).as('postExpense');
    cy.intercept('POST', '**/rest/v1/expense_amount_history*', { statusCode: 201, body: [{}] }).as('postHistory');

    cy.loginAs('admin');
    cy.visit('/expenses');
    cy.contains('button', /outras despesas/i).click();
    cy.contains('button', /nova despesa/i).click();
    cy.get('[role="dialog"]').should('be.visible').within(() => {
      cy.get('#expense-name').type('Água');
      cy.get('#expense-amount').type('1500');
      cy.contains('button', /adicionar/i).click();
    });
    cy.wait('@postExpense').its('request.body').should('include', {
      name: 'Água', category: 'other', amount: 1500, recurring: true,
    });
    cy.wait('@postHistory').its('request.body').should('include', { amount: 1500 });
  });

  it('admin: despesa pontual pede data e NÃO gera histórico', () => {
    cy.intercept('GET', '**/rest/v1/expenses?*', { statusCode: 200, body: [] });
    cy.intercept('GET', '**/rest/v1/staff_salaries?*', { statusCode: 200, body: [] });
    cy.intercept('GET', '**/rest/v1/staff?*', { statusCode: 200, body: [] });
    cy.intercept('POST', '**/rest/v1/expenses*', { statusCode: 201, body: [{}] }).as('postExpense');
    const historySpy = cy.spy().as('historySpy');
    cy.intercept('POST', '**/rest/v1/expense_amount_history*', historySpy);

    cy.loginAs('admin');
    cy.visit('/expenses');
    cy.contains('button', /outras despesas/i).click();
    cy.contains('button', /nova despesa/i).click();
    cy.get('[role="dialog"]').should('be.visible').within(() => {
      cy.get('#expense-name').type('Fritadeira nova');
      cy.contains('p', /despesa recorrente/i).closest('.flex').find('button[role="switch"]').click();
      cy.get('#expense-date').should('be.visible').clear().type('2026-08-10');
      cy.get('#expense-amount').type('5000');
      cy.contains('button', /adicionar/i).click();
    });
    cy.wait('@postExpense').its('request.body').should('include', {
      name: 'Fritadeira nova', amount: 5000, recurring: false, expense_date: '2026-08-10',
    });
    cy.get('@historySpy').should('not.have.been.called');
  });

  it('admin: guarda o salário de um funcionário (insert — nunca upsert)', () => {
    cy.intercept('GET', '**/rest/v1/expenses?*', { statusCode: 200, body: [] });
    cy.intercept('GET', '**/rest/v1/staff_salaries?*', { statusCode: 200, body: [] });
    cy.intercept('GET', '**/rest/v1/staff?*', {
      statusCode: 200,
      body: [{ id: 'a1000000-0000-0000-0000-00000000a999', tenant_id: TENANT_ID, name: 'Maria João', role: 'waiter', pin: '1234', active: true, created_at: new Date().toISOString() }],
    });
    cy.intercept('POST', '**/rest/v1/staff_salaries*', { statusCode: 201, body: [{}] }).as('postSalary');

    cy.loginAs('admin');
    cy.visit('/expenses');
    cy.contains('h3', 'Maria João').parents('.glass').within(() => {
      cy.get('input[type="number"]').clear().type('12000');
      cy.contains('button', /guardar/i).click();
    });
    cy.wait('@postSalary').its('request.body').should('include', {
      tenant_id: TENANT_ID, staff_id: 'a1000000-0000-0000-0000-00000000a999', salary: 12000,
    });
  });

  it('admin: guarda a taxa de IVA', () => {
    cy.intercept('GET', '**/rest/v1/expenses?*', { statusCode: 200, body: [] });
    cy.intercept('GET', '**/rest/v1/staff_salaries?*', { statusCode: 200, body: [] });
    cy.intercept('GET', '**/rest/v1/staff?*', { statusCode: 200, body: [] });
    cy.intercept('GET', '**/rest/v1/app_settings?*', { statusCode: 200, body: [] });
    cy.intercept('POST', '**/rest/v1/app_settings*', { statusCode: 201, body: [{}] }).as('postSettings');

    cy.loginAs('admin');
    cy.visit('/expenses');
    cy.contains('button', /^iva$/i).click();
    cy.get('#iva-rate').clear().type('17');
    cy.contains('button', /guardar/i).click();
    cy.wait('@postSettings').its('request.body.data').should('include', { ivaRate: 17 });
  });

  it('admin: IVA fora do intervalo (negativo ou > 100) mostra erro e não guarda', () => {
    cy.intercept('GET', '**/rest/v1/expenses?*', { statusCode: 200, body: [] });
    cy.intercept('GET', '**/rest/v1/staff_salaries?*', { statusCode: 200, body: [] });
    cy.intercept('GET', '**/rest/v1/staff?*', { statusCode: 200, body: [] });
    cy.intercept('GET', '**/rest/v1/app_settings?*', { statusCode: 200, body: [] });
    const settingsSpy = cy.spy().as('settingsSpy');
    cy.intercept('POST', '**/rest/v1/app_settings*', settingsSpy);

    cy.loginAs('admin');
    cy.visit('/expenses');
    cy.contains('button', /^iva$/i).click();

    cy.get('#iva-rate').clear().type('150');
    cy.contains('button', /guardar/i).click();
    cy.get('[data-sonner-toaster]').should('contain.text', 'Percentagem inválida');

    cy.get('#iva-rate').clear().type('-5');
    cy.contains('button', /guardar/i).click();
    cy.get('[data-sonner-toaster]').should('contain.text', 'Percentagem inválida');

    cy.get('@settingsSpy').should('not.have.been.called');
  });

  it('admin: botão "Guardar" do IVA fica desabilitado sem alterações', () => {
    cy.intercept('GET', '**/rest/v1/expenses?*', { statusCode: 200, body: [] });
    cy.intercept('GET', '**/rest/v1/staff_salaries?*', { statusCode: 200, body: [] });
    cy.intercept('GET', '**/rest/v1/staff?*', { statusCode: 200, body: [] });
    cy.intercept('GET', '**/rest/v1/app_settings?*', { statusCode: 200, body: [] });

    cy.loginAs('admin');
    cy.visit('/expenses');
    cy.contains('button', /^iva$/i).click();
    cy.contains('button', /guardar/i).should('be.disabled');
    cy.get('#iva-rate').clear().type('17');
    cy.contains('button', /guardar/i).should('not.be.disabled');
  });

  it('admin: valor de salário inválido (negativo) mostra erro e não guarda', () => {
    cy.intercept('GET', '**/rest/v1/expenses?*', { statusCode: 200, body: [] });
    cy.intercept('GET', '**/rest/v1/staff_salaries?*', { statusCode: 200, body: [] });
    cy.intercept('GET', '**/rest/v1/staff?*', {
      statusCode: 200,
      body: [{ id: 'a1000000-0000-0000-0000-00000000a999', tenant_id: TENANT_ID, name: 'Maria João', role: 'waiter', pin: '1234', active: true, created_at: new Date().toISOString() }],
    });
    const salarySpy = cy.spy().as('salarySpy');
    cy.intercept('POST', '**/rest/v1/staff_salaries*', salarySpy);

    cy.loginAs('admin');
    cy.visit('/expenses');
    cy.contains('h3', 'Maria João').parents('.glass').within(() => {
      cy.get('input[type="number"]').clear().type('-500');
      cy.contains('button', /guardar/i).click();
    });
    cy.get('[data-sonner-toaster]').should('contain.text', 'Valor inválido');
    cy.get('@salarySpy').should('not.have.been.called');
  });

  it('admin: sem membros da equipa, mostra mensagem em vez da grelha de salários', () => {
    cy.intercept('GET', '**/rest/v1/expenses?*', { statusCode: 200, body: [] });
    cy.intercept('GET', '**/rest/v1/staff_salaries?*', { statusCode: 200, body: [] });
    cy.intercept('GET', '**/rest/v1/staff?*', { statusCode: 200, body: [] });

    cy.loginAs('admin');
    cy.visit('/expenses');
    cy.contains(/sem membros da equipe registados em team/i).should('be.visible');
  });

  it('admin: edita uma despesa recorrente — actualiza o valor e regista um novo ponto no histórico', () => {
    cy.intercept('GET', '**/rest/v1/expenses?*', {
      statusCode: 200,
      body: [{
        id: 'e1000000-0000-0000-0000-00000000e001', tenant_id: TENANT_ID, name: 'Água', category: 'water',
        amount: 1200, recurring: true, expense_date: null, archived_at: null, created_at: '2026-01-01T00:00:00.000Z',
      }],
    });
    cy.intercept('GET', '**/rest/v1/staff_salaries?*', { statusCode: 200, body: [] });
    cy.intercept('GET', '**/rest/v1/staff?*', { statusCode: 200, body: [] });
    cy.intercept('PATCH', '**/rest/v1/expenses?*', { statusCode: 200, body: [{}] }).as('patchExpense');
    cy.intercept('POST', '**/rest/v1/expense_amount_history*', { statusCode: 201, body: [{}] }).as('postHistory');

    cy.loginAs('admin');
    cy.visit('/expenses');
    cy.contains('button', /outras despesas/i).click();
    cy.contains('h3', 'Água').parents('.glass').find('button[aria-label="Editar"]').click();
    cy.get('[role="dialog"]').should('be.visible').within(() => {
      cy.get('#expense-amount').clear().type('1500');
      cy.contains('button', /guardar/i).click();
    });
    cy.wait('@patchExpense').its('request.body').should('include', { amount: 1500, recurring: true });
    cy.wait('@postHistory').its('request.body').should('include', { amount: 1500 });
  });

  it('admin: edita uma despesa pontual — actualiza o valor mas NÃO regista histórico', () => {
    cy.intercept('GET', '**/rest/v1/expenses?*', {
      statusCode: 200,
      body: [{
        id: 'e2000000-0000-0000-0000-00000000e002', tenant_id: TENANT_ID, name: 'Fritadeira nova', category: 'other',
        amount: 5000, recurring: false, expense_date: '2026-02-01', archived_at: null, created_at: '2026-02-01T00:00:00.000Z',
      }],
    });
    cy.intercept('GET', '**/rest/v1/staff_salaries?*', { statusCode: 200, body: [] });
    cy.intercept('GET', '**/rest/v1/staff?*', { statusCode: 200, body: [] });
    cy.intercept('PATCH', '**/rest/v1/expenses?*', { statusCode: 200, body: [{}] }).as('patchExpense');
    const historySpy = cy.spy().as('historySpy');
    cy.intercept('POST', '**/rest/v1/expense_amount_history*', historySpy);

    cy.loginAs('admin');
    cy.visit('/expenses');
    cy.contains('button', /outras despesas/i).click();
    cy.contains('h3', 'Fritadeira nova').parents('.glass').find('button[aria-label="Editar"]').click();
    cy.get('[role="dialog"]').should('be.visible').within(() => {
      cy.get('#expense-amount').clear().type('5500');
      cy.contains('button', /guardar/i).click();
    });
    cy.wait('@patchExpense').its('request.body').should('include', { amount: 5500, recurring: false });
    cy.get('@historySpy').should('not.have.been.called');
  });

  it('admin: remove uma despesa — arquiva em vez de apagar (PATCH archived_at), nunca DELETE', () => {
    cy.intercept('GET', '**/rest/v1/expenses?*', {
      statusCode: 200,
      body: [{
        id: 'e1000000-0000-0000-0000-00000000e001', tenant_id: TENANT_ID, name: 'Água', category: 'water',
        amount: 1200, recurring: true, expense_date: null, archived_at: null, created_at: '2026-01-01T00:00:00.000Z',
      }],
    });
    cy.intercept('GET', '**/rest/v1/staff_salaries?*', { statusCode: 200, body: [] });
    cy.intercept('GET', '**/rest/v1/staff?*', { statusCode: 200, body: [] });
    const deleteSpy = cy.spy().as('deleteSpy');
    cy.intercept('DELETE', '**/rest/v1/expenses?*', deleteSpy);
    cy.intercept('PATCH', '**/rest/v1/expenses?*', { statusCode: 200, body: [{}] }).as('patchExpense');

    cy.loginAs('admin');
    cy.visit('/expenses');
    cy.contains('button', /outras despesas/i).click();
    cy.contains('h3', 'Água').parents('.glass').find('button[aria-label="Remover"]').click();
    cy.get('[role="alertdialog"]').should('be.visible').within(() => {
      cy.contains('button', /^remover$/i).click();
    });
    cy.wait('@patchExpense').its('request.body').should('have.property', 'archived_at');
    cy.get('@deleteSpy').should('not.have.been.called');
    cy.contains('h3', 'Água').should('not.exist');
  });
});
