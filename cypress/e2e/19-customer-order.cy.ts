import { TENANT_ID } from '../support/roles';

// Fluxo de pedido pelo PRÓPRIO cliente (QR na mesa / entrega) — a única
// página pública e não autenticada que ESCREVE dados reais (dinheiro,
// estoque). Não passa por cy.loginAs(): fala directo com REST/RPC do
// Supabase (ver src/lib/customerOrder.ts), interceptado aqui exactamente
// como o resto da suite. `menu_items` já está no baseline global (lista
// vazia por omissão) — sobrepomos com dados próprios; as RPCs usadas aqui
// (get_public_branding/verify_loyalty_customer/submit_customer_order) não
// estão no baseline, por isso têm de ser sempre interceptadas pelo próprio
// teste ou a página fica à espera de uma resposta que nunca chega.

const TABLE_ID = 'b0000000-0000-0000-0000-00000000ab01';

const MENU_ITEM = {
  id: 'c0000000-0000-0000-0000-00000000c001',
  name: 'Frango à Zambeziana', price: 350, category: 'Pratos',
  description: 'Grelhado com piri-piri', image_path: null, modifiers: [], available: true,
};
const DRINK_ITEM = {
  id: 'c0000000-0000-0000-0000-00000000c002',
  name: 'Coca-Cola 300ml', price: 60, category: 'Bebidas',
  description: null, image_path: null, modifiers: [], available: true,
};

function mockMenu(items: unknown[] = [MENU_ITEM, DRINK_ITEM]) {
  cy.intercept('GET', '**/rest/v1/menu_items?*', { statusCode: 200, body: items }).as('getPublicMenu');
}

/** `get_public_branding` devolve jsonb — ao contrário de submit_customer_order
 *  (scalar uuid), o corpo aqui NÃO precisa de JSON.stringify duplo. */
function mockBranding(body: Record<string, unknown> | null = null) {
  cy.intercept('POST', '**/rest/v1/rpc/get_public_branding', { statusCode: 200, body }).as('getBranding');
}

function addFirstItemToCart(name = MENU_ITEM.name) {
  cy.contains(name).parents('.bg-card').find('button[aria-label^="Adicionar"]').click();
}

describe('Pedido pelo cliente — mesa (QR)', () => {
  beforeEach(() => {
    mockMenu();
    mockBranding();
  });

  it('carrega o cardápio da mesa e mostra o número da mesa', () => {
    cy.visit(`/pedir/${TENANT_ID}/mesa/${TABLE_ID}?n=5`);
    cy.wait('@getPublicMenu');
    cy.contains('Mesa 5').should('be.visible');
    cy.contains(MENU_ITEM.name).should('be.visible');
  });

  it('adiciona um item e submete: p_table_id preenchido, sem telefone, com chave de idempotência', () => {
    cy.intercept('POST', '**/rest/v1/rpc/submit_customer_order', (req) => {
      expect(req.body.p_table_id).to.eq(TABLE_ID);
      expect(req.body.p_customer_phone).to.be.null;
      expect(req.body.p_idempotency_key).to.be.a('string').and.not.be.empty;
      req.reply({ statusCode: 200, body: JSON.stringify('d0000000-0000-0000-0000-00000000d001') });
    }).as('submitOrder');

    cy.visit(`/pedir/${TENANT_ID}/mesa/${TABLE_ID}?n=5`);
    cy.wait('@getPublicMenu');
    addFirstItemToCart();
    cy.contains('button', /fazer pedido/i).click();
    cy.wait('@submitOrder');
    cy.location('pathname').should('match', /^\/pedido\//);
  });

  it('duplo clique no botão de enviar só dispara UMA chamada de rede (ver também customerOrderPage.test.tsx)', () => {
    let calls = 0;
    cy.intercept('POST', '**/rest/v1/rpc/submit_customer_order', (req) => {
      calls += 1;
      req.reply({ statusCode: 200, body: JSON.stringify('d0000000-0000-0000-0000-00000000d002'), delay: 300 });
    }).as('submitOrder');

    cy.visit(`/pedir/${TENANT_ID}/mesa/${TABLE_ID}`);
    cy.wait('@getPublicMenu');
    addFirstItemToCart();
    // Dois cliques disparados de seguida no MESMO elemento jQuery, sem passar
    // pelo motor de "actionability" do cy.click() entre eles — o mais perto
    // que dá de recriar, em Cypress, um duplo-toque real na mesma tarefa.
    cy.contains('button', /fazer pedido/i).then($btn => {
      $btn[0].click();
      $btn[0].click();
    });
    cy.wait('@submitOrder');
    cy.wrap(null).should(() => { expect(calls).to.eq(1); });
  });

  it('falha na submissão (orderId null) mostra erro e mantém o carrinho para nova tentativa', () => {
    cy.intercept('POST', '**/rest/v1/rpc/submit_customer_order', {
      statusCode: 200, body: JSON.stringify(null),
    }).as('submitOrder');

    cy.visit(`/pedir/${TENANT_ID}/mesa/${TABLE_ID}`);
    cy.wait('@getPublicMenu');
    addFirstItemToCart();
    cy.contains('button', /fazer pedido/i).click();
    cy.wait('@submitOrder');
    cy.contains(/não foi possível enviar o pedido/i).should('be.visible');
    cy.contains('button', /fazer pedido/i).should('be.visible');
  });

  it('erro de rede/servidor (ex.: rejeição do plano Básico) mostra erro sem quebrar a página', () => {
    cy.intercept('POST', '**/rest/v1/rpc/submit_customer_order', {
      statusCode: 400, body: { message: 'not available on this plan' },
    }).as('submitOrder');

    cy.visit(`/pedir/${TENANT_ID}/mesa/${TABLE_ID}`);
    cy.wait('@getPublicMenu');
    addFirstItemToCart();
    cy.contains('button', /fazer pedido/i).click();
    cy.wait('@submitOrder');
    cy.contains(/não foi possível enviar o pedido/i).should('be.visible');
  });

  it('sem marca configurada (branding nulo), mostra o cabeçalho genérico sem quebrar', () => {
    cy.visit(`/pedir/${TENANT_ID}/mesa/${TABLE_ID}`);
    cy.wait('@getPublicMenu');
    cy.wait('@getBranding');
    cy.contains('Cardápio').should('be.visible');
  });

  it('com marca configurada, mostra o nome do restaurante em vez do "Cardápio" genérico', () => {
    mockBranding({ brandName: 'Sabor de Nampula', iconEmoji: '🍢' });
    cy.visit(`/pedir/${TENANT_ID}/mesa/${TABLE_ID}`);
    cy.wait('@getPublicMenu');
    cy.wait('@getBranding');
    cy.contains('Sabor de Nampula').should('be.visible');
  });

  it('pesquisa filtra o cardápio por nome', () => {
    cy.visit(`/pedir/${TENANT_ID}/mesa/${TABLE_ID}`);
    cy.wait('@getPublicMenu');
    cy.get('input[placeholder*="Pesquisar"]').type('coca');
    cy.contains(DRINK_ITEM.name).should('be.visible');
    cy.contains(MENU_ITEM.name).should('not.exist');
  });

  it('filtro por categoria mostra só os itens dessa categoria', () => {
    cy.visit(`/pedir/${TENANT_ID}/mesa/${TABLE_ID}`);
    cy.wait('@getPublicMenu');
    cy.contains('button', 'Bebidas').click();
    cy.contains(DRINK_ITEM.name).should('be.visible');
    cy.contains(MENU_ITEM.name).should('not.exist');
  });

  it('cardápio vazio mostra mensagem de indisponível em vez de uma grelha vazia', () => {
    mockMenu([]);
    cy.visit(`/pedir/${TENANT_ID}/mesa/${TABLE_ID}`);
    cy.wait('@getPublicMenu');
    cy.contains(/cardápio indisponível/i).should('be.visible');
  });
});

describe('Pedido pelo cliente — entrega', () => {
  const PHONE = '841234567';

  beforeEach(() => {
    mockMenu();
    mockBranding();
  });

  it('telefone não registado na fidelização: mostra aviso e NÃO avança para a morada', () => {
    cy.intercept('POST', '**/rest/v1/rpc/verify_loyalty_customer', { statusCode: 200, body: null }).as('verifyPhone');

    cy.visit(`/pedir/${TENANT_ID}/entrega`);
    cy.get('#cust-phone').type(PHONE);
    cy.contains('button', /confirmar/i).click();
    cy.wait('@verifyPhone');
    cy.contains(/ainda não é cliente registado/i).should('be.visible');
    cy.get('#cust-address').should('not.exist');
  });

  it('telefone registado: avança para a morada, confirma e chega ao cardápio', () => {
    cy.intercept('POST', '**/rest/v1/rpc/verify_loyalty_customer', {
      statusCode: 200, body: { id: 'cust-1', name: 'Maria João', address: null },
    }).as('verifyPhone');

    cy.visit(`/pedir/${TENANT_ID}/entrega`);
    cy.get('#cust-phone').type(PHONE);
    cy.contains('button', /confirmar/i).click();
    cy.wait('@verifyPhone');
    cy.contains('Olá, Maria João').should('be.visible');

    cy.get('#cust-address').type('Rua da Praia, 123');
    cy.contains('button', /continuar para o cardápio/i).click();
    cy.wait('@getPublicMenu');
    cy.contains(MENU_ITEM.name).should('be.visible');
    cy.contains(/entrega para/i).should('be.visible').and('contain.text', 'Maria João');
  });

  it('sem morada preenchida, "Continuar" mostra erro e não avança', () => {
    cy.intercept('POST', '**/rest/v1/rpc/verify_loyalty_customer', {
      statusCode: 200, body: { id: 'cust-1', name: 'Maria João', address: null },
    }).as('verifyPhone');

    cy.visit(`/pedir/${TENANT_ID}/entrega`);
    cy.get('#cust-phone').type(PHONE);
    cy.contains('button', /confirmar/i).click();
    cy.wait('@verifyPhone');
    cy.contains('button', /continuar para o cardápio/i).click();
    cy.contains(/indique a morada de entrega/i).should('be.visible');
    cy.get('#cust-address').should('be.visible');
  });

  it('"Enviar a minha localização" preenche o link do Google Maps na morada', () => {
    cy.intercept('POST', '**/rest/v1/rpc/verify_loyalty_customer', {
      statusCode: 200, body: { id: 'cust-1', name: 'Maria João', address: null },
    }).as('verifyPhone');

    cy.visit(`/pedir/${TENANT_ID}/entrega`, {
      onBeforeLoad(win) {
        cy.stub(win.navigator.geolocation, 'getCurrentPosition').callsFake((success: PositionCallback) => {
          success({ coords: { latitude: -25.9, longitude: 32.6 } } as GeolocationPosition);
        });
      },
    });
    cy.get('#cust-phone').type(PHONE);
    cy.contains('button', /confirmar/i).click();
    cy.wait('@verifyPhone');
    cy.contains('button', /enviar a minha localização/i).click();
    cy.get('#cust-address').invoke('val').should('match', /google\.com\/maps\?q=-25\.9,32\.6/);
  });

  it('submete o pedido de entrega com telefone/morada e SEM table_id', () => {
    cy.intercept('POST', '**/rest/v1/rpc/verify_loyalty_customer', {
      statusCode: 200, body: { id: 'cust-1', name: 'Maria João', address: 'Rua Velha, 1' },
    }).as('verifyPhone');
    cy.intercept('POST', '**/rest/v1/rpc/submit_customer_order', (req) => {
      expect(req.body.p_table_id).to.be.null;
      expect(req.body.p_customer_phone).to.contain('841234567'.slice(0, 2)); // masked, mas com os dígitos originais
      expect(req.body.p_delivery_address).to.eq('Rua Velha, 1');
      req.reply({ statusCode: 200, body: JSON.stringify('d0000000-0000-0000-0000-00000000d003') });
    }).as('submitOrder');

    cy.visit(`/pedir/${TENANT_ID}/entrega`);
    cy.get('#cust-phone').type(PHONE);
    cy.contains('button', /confirmar/i).click();
    cy.wait('@verifyPhone');
    cy.contains('button', /continuar para o cardápio/i).click();
    cy.wait('@getPublicMenu');

    addFirstItemToCart();
    cy.contains('button', /fazer pedido/i).click();
    cy.wait('@submitOrder');
    cy.location('pathname').should('match', /^\/pedido\//);
  });
});
