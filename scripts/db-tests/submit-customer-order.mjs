// Testes de integração contra um projecto Supabase REAL — a única forma de
// exercitar submit_customer_order()/o trigger de dedução de estoque/RLS de
// verdade, já que Vitest e Cypress interceptam toda a rede (ver plano de
// testes). Corre contra um projecto Supabase dedicado só a isto
// (restaurant-v2-db-tests, ref mdjfoczmupjywjiuymjt — Docker/virtualização
// não estava disponível nesta máquina para um Supabase local), NUNCA contra
// produção — o project ref de produção está bloqueado abaixo mesmo que seja
// passado por engano.
//
// Uso: node scripts/db-tests/submit-customer-order.mjs [projectRef]
// (projectRef é opcional — por omissão usa o projecto de testes acima)

import { execSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';

const PRODUCTION_REF = 'bbpfoygfxqwjqsolisqw';
const TEST_PROJECT_REF = 'mdjfoczmupjywjiuymjt';

function projectCredentials(ref) {
  if (ref === PRODUCTION_REF) {
    throw new Error('SEGURANÇA: este script nunca corre contra o projecto de produção.');
  }
  const raw = execSync(`npx supabase projects api-keys --project-ref ${ref} -o json`, { encoding: 'utf8' });
  const keys = JSON.parse(raw);
  const anonKey = keys.find(k => k.id === 'anon')?.api_key;
  const serviceKey = keys.find(k => k.id === 'service_role')?.api_key;
  return { url: `https://${ref}.supabase.co`, anonKey, serviceKey };
}

let passed = 0;
let failed = 0;
function check(label, cond, detail) {
  if (cond) { passed++; console.log(`  ok   ${label}`); }
  else { failed++; console.log(`  FAIL ${label}${detail ? ' — ' + detail : ''}`); }
}

async function main() {
  const ref = process.argv[2] || TEST_PROJECT_REF;
  const { url, anonKey, serviceKey } = projectCredentials(ref);
  if (!url || !anonKey || !serviceKey) {
    throw new Error(`Não consegui obter as chaves API do projecto ${ref}.`);
  }
  console.log(`A testar contra ${url} (${ref})\n`);

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const anon = createClient(url, anonKey, { auth: { persistSession: false } });

  // ---- seed: tenant + mesa + bebida ligada ao inventário -------------------
  const { data: tenant, error: tenantErr } = await admin
    .from('tenants').insert({ name: 'DB Test Tenant', owner_email: `dbtest-${Date.now()}@example.com` })
    .select('id').single();
  if (tenantErr) throw tenantErr;
  const tenantId = tenant.id;

  try {
    const { data: table, error: tableErr } = await admin
      .from('restaurant_tables').insert({ tenant_id: tenantId, number: 1, seats: 4 })
      .select('id').single();
    if (tableErr) throw tableErr;

    const { data: menuItem, error: menuErr } = await admin
      .from('menu_items')
      .insert({ tenant_id: tenantId, name: 'Fanta Laranja', price: 55, category: 'Bebidas', available: true })
      .select('id').single();
    if (menuErr) throw menuErr;

    const STARTING_STOCK = 11;
    const USAGE_PER_SERVING = 1;
    const { data: invItem, error: invErr } = await admin
      .from('inventory_items')
      .insert({
        tenant_id: tenantId, name: 'Fanta Laranja', unit: 'un',
        current_stock: STARTING_STOCK, min_stock: 2, cost_per_unit: 30,
        linked_menu_item_ids: [menuItem.id], usage_per_serving: USAGE_PER_SERVING,
      })
      .select('id').single();
    if (invErr) throw invErr;

    const items = [{ menu_item_id: menuItem.id, quantity: 1 }];

    // ---- 1) duas chamadas sequenciais com a MESMA idempotency key ----------
    console.log('1) Idempotência — duas chamadas sequenciais, mesma chave');
    const key1 = crypto.randomUUID();
    const call = () => anon.rpc('submit_customer_order', {
      p_tenant_id: tenantId, p_table_id: table.id, p_customer_phone: null,
      p_customer_name: null, p_items: items, p_delivery_address: null,
      p_idempotency_key: key1,
    });
    const r1 = await call();
    const r2 = await call();
    check('primeira chamada não deu erro', !r1.error, r1.error?.message);
    check('segunda chamada não deu erro', !r2.error, r2.error?.message);
    check('as duas devolvem o MESMO order_id', r1.data && r1.data === r2.data, `${r1.data} vs ${r2.data}`);

    const { data: ordersAfterSeq } = await admin.from('orders').select('id').eq('tenant_id', tenantId);
    check('só existe UM pedido na base de dados', (ordersAfterSeq ?? []).length === 1, `encontrados: ${ordersAfterSeq?.length}`);

    const { data: invAfterSeq } = await admin.from('inventory_items').select('current_stock').eq('id', invItem.id).single();
    const expectedAfterSeq = STARTING_STOCK - USAGE_PER_SERVING * 1;
    check(
      `estoque desceu exactamente ${USAGE_PER_SERVING} unidade (não em dobro)`,
      Number(invAfterSeq.current_stock) === expectedAfterSeq,
      `esperado ${expectedAfterSeq}, ficou ${invAfterSeq.current_stock}`,
    );

    const { data: itemsAfterSeq } = await admin.from('order_items').select('status').eq('order_id', r1.data);
    check(
      'item de Bebidas entrou já como "ready" (não vai à cozinha)',
      itemsAfterSeq?.[0]?.status === 'ready',
      `status: ${itemsAfterSeq?.[0]?.status}`,
    );

    // ---- 2) duas chamadas em paralelo, mesma chave (corrida real) ----------
    console.log('\n2) Idempotência — duas chamadas em paralelo, mesma chave');
    const key2 = crypto.randomUUID();
    const parallelCall = () => anon.rpc('submit_customer_order', {
      p_tenant_id: tenantId, p_table_id: table.id, p_customer_phone: null,
      p_customer_name: null, p_items: items, p_delivery_address: null,
      p_idempotency_key: key2,
    });
    const [p1, p2] = await Promise.all([parallelCall(), parallelCall()]);
    check('primeira chamada paralela não deu erro', !p1.error, p1.error?.message);
    check('segunda chamada paralela não deu erro', !p2.error, p2.error?.message);
    check('as duas devolvem o MESMO order_id mesmo em paralelo', p1.data && p1.data === p2.data, `${p1.data} vs ${p2.data}`);

    const { data: ordersAfterPar } = await admin.from('orders').select('id').eq('tenant_id', tenantId);
    check('ainda só há DOIS pedidos no total (1 da secção 1 + 1 desta)', (ordersAfterPar ?? []).length === 2, `encontrados: ${ordersAfterPar?.length}`);

    // ---- 3) sem chave (cliente antigo/sem JS actualizado) — continua a funcionar
    console.log('\n3) Sem idempotency key — continua a criar o pedido normalmente');
    const r3 = await anon.rpc('submit_customer_order', {
      p_tenant_id: tenantId, p_table_id: table.id, p_customer_phone: null,
      p_customer_name: null, p_items: items, p_delivery_address: null,
    });
    check('chamada sem chave não deu erro', !r3.error, r3.error?.message);
    check('devolveu um order_id novo', !!r3.data && r3.data !== r1.data && r3.data !== p1.data);

    // ---- 4) item que NÃO é Bebidas entra 'pending' (vai à cozinha) --------
    console.log('\n4) Prato normal continua a ir para a cozinha');
    const { data: dish } = await admin
      .from('menu_items')
      .insert({ tenant_id: tenantId, name: 'Frango Grelhado', price: 250, category: 'Pratos Principais', available: true })
      .select('id').single();
    const r4 = await anon.rpc('submit_customer_order', {
      p_tenant_id: tenantId, p_table_id: table.id, p_customer_phone: null,
      p_customer_name: null, p_items: [{ menu_item_id: dish.id, quantity: 1 }], p_delivery_address: null,
      p_idempotency_key: crypto.randomUUID(),
    });
    check('pedido de prato normal não deu erro', !r4.error, r4.error?.message);
    const { data: dishItems } = await admin.from('order_items').select('status').eq('order_id', r4.data);
    check('prato entrou como "pending" (vai à cozinha)', dishItems?.[0]?.status === 'pending', `status: ${dishItems?.[0]?.status}`);
  } finally {
    // ---- limpeza: cascata apaga mesa/menu/inventário/pedidos ----------------
    await admin.from('tenants').delete().eq('id', tenantId);
  }

  console.log(`\n${passed} passaram, ${failed} falharam`);
  if (failed > 0) process.exit(1);
}

main().catch(err => {
  console.error('\nErro fatal:', err.message ?? err);
  process.exit(1);
});
