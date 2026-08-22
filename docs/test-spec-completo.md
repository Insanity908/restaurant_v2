# Spec de testes completos — restaurant_v2

Estado em 2026-08-21. Cobre a suite existente (unit + e2e) e, com mais detalhe,
os gaps deixados pelo trabalho ainda não commitado desta sessão (despesas,
arquivo de dados, idempotência de pedidos, relógio de servidor, etc.).

**Progresso**: §2.1, §2.1.2, §2.2, §2.3, §2.4 e §2.6 já têm testes escritos e
passando — ver `src/test/serverClock.test.ts` (novo),
`src/test/customerOrderPage.test.tsx` (novo, guard de duplo-toque),
`cypress/e2e/19-customer-order.cy.ts` (novo, 15 testes — mesa/QR e entrega,
branding, busca/filtro, falhas de submissão), `cypress/e2e/20-data-archive.cy.ts`
(novo, 8 testes — relatório anual, exports, gate de exclusão, purge-old-data),
`18-expenses.cy.ts` (completado: editar/remover despesa, IVA fora do
intervalo, salário inválido, equipa vazia) e as adições a `src/test/store.test.ts`
(guard de `inventoryStore`, `mergePending` para menu/inventário,
referência-contada de `subscribeOperations`). Os dois testes do duplo-toque
(unit e e2e) foram verificados a falhar de propósito (desligando
`submittingRef` temporariamente) antes de confirmar que passam — não são
testes que passam por acidente.

**A restrição de acesso a `/expenses` e `/data-archive` foi centralizada** em
`cypress/support/roles.ts` (`ROUTE_PERMISSIONS`) — a matriz genérica em
`03-route-permissions.cy.ts` agora cobre os 6 papéis × as 2 rotas
automaticamente, substituindo o loop ad-hoc que só testava 4 papéis (faltava
`superadmin`) e que existia em `18-expenses.cy.ts`.

**Bug real encontrado e corrigido ao escrever estes testes** (não um problema
do teste): `ExpensesPage.tsx` e `StaffPage.tsx` liam `staffStore.getAll()`
uma única vez num `useEffect` sem depender de `catalogVersion` — o mesmo
padrão que `useRestaurant.ts` já documentava como perigoso (comentário
explícito nesse ficheiro). Numa visita directa a `/expenses` ou `/staff`
(refresh do browser, link direto) antes do fetch de fundo do catálogo
(AuthContext) terminar, a página ficava permanentemente presa a mostrar
"sem equipa" mesmo havendo funcionários — o efeito só corre uma vez e nunca
relê o cache local depois do fetch chegar. Corrigido adicionando
`catalogVersion` (de `useAuth()`) à dependência dos dois efeitos, replicando
o padrão já usado em `useRestaurant.ts`. Verificado sem regressões na suite
unit completa (74+ testes) e nos dois specs Cypress novos/alterados.

**Nota de ambiente**: o primeiro teste de uma corrida Cypress contra um
servidor Vite dev recém-arrancado por vezes excede o timeout por causa do
cold-compile da rota (visto em 3 specs diferentes) — não é um bug da
aplicação nem dos testes; reproduz-se de forma limpa (0 falhas) numa segunda
corrida com o servidor já "quente". Um pipeline de CI real deve compilar a
app primeiro (`vite build` + preview) em vez de usar `vite dev`, precisamente
para evitar esta classe de flake.

**§3 (regressões nas páginas grandes) está feito**, com um refactor pequeno
para viabilizar os testes de §3.1: `computeStats`/`periodDays`/`ZERO_FIXED`/
`pctChange` foram extraídos de `ReportsPage.tsx` para `src/lib/reportStats.ts`
(mesmas funções, zero mudança de comportamento — só passaram a ser
importadas em vez de definidas inline) para poderem ser testadas
directamente sem montar a página inteira. Ver `src/test/reportStats.test.ts`
(16 testes, incl. a regressão mais importante: sem despesas/IVA configurados
o lucro fica idêntico ao valor pré-mudança), `src/test/appSidebar.test.tsx`
(badge de pedidos pendentes, imagem de fundo em `document.body` com cleanup,
rótulo "Team"), `src/test/menuItemDialog.test.tsx` (nome duplicado,
categoria Bebidas, herança de imagem do inventário), as adições a
`ui-integration-2.test.tsx` (confirmação antes de remover imagem preset) e a
`08-pos.cy.ts` (layout mobile do painel de pagamento).

**§3.6 (CustomersPage) não precisou de teste novo** — o botão "Configurar"
removido era só um atalho (`document.querySelector` a clicar programaticamente
na aba de definições); a aba "Configurações" com o programa de fidelidade
continua lá, alcançável por um clique manual. Confirmado por leitura de
código, não há regressão funcional nem teste pré-existente a quebrar.

**Achado ao escrever os testes de §3.3 (POS mobile)**: não foi bug de
produção — três asserções minhas assumiam que o botão "Confirmar Pagamento"
estaria visível sem scroll (o resumo do pedido mudou de posição nesta sessão
e agora empurra o botão para abaixo da dobra, tanto em mobile como em
desktop). `cy.click()` já rola automaticamente até ao elemento; uma asserção
de visibilidade sozinha não. Corrigido com `.scrollIntoView()` antes da
asserção — inclui uma correcção ao teste pré-existente `DADOS INCORRECTOS`
(não escrito nesta sessão) que tinha o mesmo problema, exposto pela mesma
mudança de layout.

**§4 e §5 estão feitos**, na medida em que dá para fazer sem um projecto
Supabase de teste (as partes de RLS admin-only em `expenses`/
`staff_salaries` continuam a exigir isso — ver abaixo). Em vez de só
documentar o risco, `src/test/publicBrandingSecurity.test.ts` (12 testes)
faz uma análise estática do SQL das migrations/`schema_clean_install.sql`:
confirma que `get_public_branding` devolve exactamente as 9 chaves de
marca/cores (nem mais, nem menos), nunca referencia nomes de campos
sensíveis (mpesaNumber, bankAccount, etc.), nunca faz `select *`/devolve
`s.data` inteiro, que a migration e o `schema_clean_install.sql` não
divergem entre si, e que `now_utc()` não aceita parâmetros. **Verificado a
apanhar o problema de verdade**: injectei uma chave `mpesaNumber` a mais no
`jsonb_build_object` da migration e confirmei que 3 dos 12 testes falham
imediatamente, depois revertido. `src/test/exportExcel.test.ts` (9 testes)
usa a biblioteca `xlsx` real (só `writeFile` é mockado) para confirmar as 6
folhas geradas, os valores arredondados correctamente (inteiro, excepto
margem com 1 casa decimal), o nome do ficheiro com/sem mês, e que arrays
vazios não rebentam `json_to_sheet`.

§2.1.1/§2.3.1 (idempotência/purge-old-data a nível SQL) e a parte de RLS
admin-only de §4 continuam por fazer — exigem mesmo um projecto Supabase de
teste real (curl/psql), não são mockáveis nem verificáveis por análise
estática do SQL.

Convenções já em uso e que esta spec segue:

- **Unit (vitest)**: `src/test/*.test.ts(x)`. Mocka `@/integrations/supabase/client`
  e `./outbox` (`cloud()`) — ver padrão `cloudCalls` em `store.test.ts`. Roda com
  `npm test`.
- **E2E (cypress)**: `cypress/e2e/NN-nome.cy.ts`, numerados por ordem de criação.
  Nunca toca a rede real — `cy.mockSupabaseBaseline()` (global, em `support/e2e.ts`)
  intercepta todas as `CATALOG_TABLES`; `cy.loginAs(role)` autentica pelo ecrã
  real. RLS real já foi validado à parte contra Postgres (ver memória
  `security-review-state`) — esta suite testa a aplicação, não o backend.
- Nomes de tabelas/RPCs nesta spec vêm do código lido nesta sessão
  (`src/lib/*.ts`, `supabase/migrations/*.sql`, `supabase/functions/*/index.ts`).
  Confirme que ainda existem antes de escrever o teste — o código pode ter
  mudado desde então.

---

## 1. Inventário do que já está coberto (baseline)

Não repetir — serve só para saber onde não há buraco.

| Área | Ficheiro(s) |
|---|---|
| Login/signup, permissões de rota | `01-auth`, `02-signup`, `03-route-permissions` |
| Dashboard, Menu, Mesas, Cozinha, POS, Inventário | `04`–`09` |
| Clientes/fidelidade, Turnos, Equipa, Configurações | `10`–`13` |
| Billing/pricing, Onboarding, SuperAdmin, bloqueado/404 | `14`–`17` |
| Despesas (parcial — ver §3.1) | `18-expenses.cy.ts` |
| `menuStore`, `tableStore`, `orderStore`, permissões, outbox/race, a11y, tenant switching | `src/test/*.test.ts` |

---

## 2. Lacunas críticas (prioridade 1 — sem nenhuma cobertura hoje)

### 2.1 Fluxo de pedido pelo cliente (`/pedir/:tenantId/mesa/:tableId`, `/pedir/:tenantId/entrega`)

**Não existe nenhum ficheiro cypress para esta rota.** É a única página pública
e não autenticada que escreve dados (RLS `anon`), com dinheiro/estoque reais em
jogo — é o maior risco da suite atual. Criar `cypress/e2e/19-customer-order.cy.ts`.

Como esta página faz `fetch` diretos a REST/RPC do Supabase (não passa por
`loginAs`), os intercepts são sobre `**/rest/v1/rpc/submit_customer_order`,
`**/rest/v1/menu_items?*` (`fetchPublicMenu`), `**/rest/v1/rpc/get_public_branding`,
`**/rest/v1/rpc/verify_loyalty_customer` — confirmar nomes exatos em
`src/lib/customerOrder.ts` antes de escrever.

Casos:
- **Mesa (dine-in)**: visita `/pedir/:tenantId/mesa/:tableId?n=5`, cardápio
  carrega, adiciona itens ao carrinho, submete → `submit_customer_order` chamado
  com `p_table_id`, `p_idempotency_key` presente (UUID) e sem `p_customer_phone`.
- **Entrega**: telefone não registado → mensagem "cliente não registado" e
  **não** avança para o ecrã de morada (a RPC real rejeita com `'customer not
  registered'`, mas o gate client-side em `verify_loyalty_customer` deve barrar
  antes). Telefone registado → ecrã de morada → "Enviar localização" preenche o
  link do Google Maps (mock `navigator.geolocation.getCurrentPosition`) →
  confirmar morada → cardápio.
- **Categoria "Bebidas"**: pedido com um item de bebida — não é possível
  verificar o status inicial (`ready` vs `pending`) via UI cliente sozinho;
  documentar como teste de integração via SQL/edge (ver §2.1.1) em vez de e2e
  puro.
- **Duplo-toque / idempotência**: clicar "Enviar pedido" duas vezes rapidamente
  (ou usar `cy.get(...).click().click()` sem esperar) → apenas **uma** chamada
  de rede a `submit_customer_order` chega a sair (a trava é a `submittingRef`
  síncrona em `CustomerOrderPage.tsx` — teste unitário complementar em §2.1.2
  cobre o caso em que a trava falha e duas chamadas HTTP saem mesmo assim).
- **Falha de submissão**: intercept da RPC devolvendo erro → toast "Não foi
  possível enviar o pedido..." e o carrinho **não** é limpo (permite retry sem
  reconstruir o pedido).
- **Branding**: mock de `get_public_branding` com `brandName`/`iconEmoji`
  customizados → aparecem no cabeçalho (`BrandHeader`) em vez de "Cardápio"/🍽️
  genérico. Sem branding (RPC devolve `null`/erro) → cai no fallback sem
  quebrar a página.
- **Busca e filtro por categoria**: digitar na busca filtra por nome/descrição
  (case-insensitive); trocar de categoria via tabs filtra a lista.
- **Plano Básico**: pedido de entrega/QR num tenant `basic-*` — a RPC real
  rejeita (`'not available on this plan'`); testar que o erro chega à UI como
  toast de falha, não como crash.

#### 2.1.1 Idempotência e regra de bebidas — nível SQL/RPC (não cypress)

Estes dois bugs foram corrigidos na migration
`20260821090000_customer_order_idempotency.sql` e não são verificáveis por
mock de rede (a lógica vive inteiramente dentro da função Postgres). Requer
teste de integração real contra um projeto de desenvolvimento Supabase
(mesmo padrão da sessão de 2026-08-12 documentada na memória
`security-review-state` — curl/psql direto, não Cypress):

1. Chamar `submit_customer_order(...)` duas vezes com o **mesmo**
   `p_idempotency_key` → deve devolver o **mesmo** `order_id` nas duas
   chamadas, e `select count(*) from order_items where order_id = ...` deve
   refletir **um** pedido só (estoque descontado uma vez, não duas).
2. Chamar sem `p_idempotency_key` (NULL) duas vezes → dois pedidos distintos
   (idempotência é opt-in; NULL nunca colide, por causa do índice parcial
   `where idempotency_key is not null`).
3. Duas chamadas **verdadeiramente concorrentes** com a mesma chave (dois
   `psql`/`curl` disparados em paralelo) → uma insere, a outra apanha
   `unique_violation` e devolve o `id` da primeira (branch `exception when
   unique_violation`) — sem lançar erro para o cliente.
4. Item de categoria `'Bebidas'` pedido via `submit_customer_order` → a linha
   em `order_items` nasce com `status = 'ready'`; item de qualquer outra
   categoria nasce `'pending'`. Comparar com o que `MenuPage.tsx`
   (`initialStatus`) produz para o mesmo item quando um funcionário o
   seleciona manualmente — as duas vias devem concordar sempre.

#### 2.1.2 Trava de duplo-toque — unit test

`src/pages/CustomerOrderPage.tsx` usa `submittingRef` (não `submitting` state)
para bloquear disparos síncronos. Testar via `@testing-library/react`:
renderizar a página com um mock de `submitCustomerOrder` que demora (Promise
não resolvida ainda), disparar dois cliques seguidos síncronos no botão de
enviar, e verificar que `submitCustomerOrder` foi chamado **exatamente uma
vez** antes da promise resolver.

---

### 2.2 Despesas e salários — completar `18-expenses.cy.ts`

Hoje só cobre: bloqueio de papéis não-admin, criar despesa recorrente, criar
despesa pontual, guardar salário (insert), guardar IVA. Faltam:

- **Editar despesa existente** (`openEdit` → `expenseStore.update`): abrir
  diálogo de edição pré-preenchido, mudar valor, guardar → intercept `PATCH
  **/rest/v1/expenses*` com `eq.id`/`eq.tenant_id`; se a despesa é recorrente e
  `amount` mudou, confirmar que **também** dispara um novo insert em
  `expense_amount_history` (ver `recordExpenseAmountHistory` chamado dentro do
  `.then` de `cloud('expenses').update`).
- **Editar despesa pontual não recorrente**: mudar `amount` não deve gerar
  linha de histórico (branch `isRecurring` falso).
- **Remover despesa**: clicar Remover → confirma no `AlertDialog` → intercept
  `PATCH` com `archived_at` setado (não é um `DELETE` — é soft-archive, ver
  `expenseStore.remove`); o item some da lista local mesmo se a rede falhar
  (otimista).
- **IVA fora do intervalo**: digitar `-5` ou `150` em `#iva-rate` → toast
  "Percentagem inválida (0–100)" e **nenhum** `POST`/`PATCH` a `app_settings`.
- **Botão "Guardar" do IVA desabilitado quando não há alteração**: `ivaDraft
  === String(settings.ivaRate)` → botão `disabled`.
- **Salário com valor inválido**: string vazia/negativa → toast "Valor
  inválido" e nenhuma chamada de rede.
- **Lista de equipa vazia**: sem `staff`, mostra "Sem membros da equipe
  registados em Team." (nome atualizado — ver §2.5, a página de Equipa/Staff
  foi rebatizada "Team" nesta sessão).
- **superadmin também é bloqueado** em `/expenses` (o loop atual só testa
  `manager`, `cashier`, `waiter`, `kitchen` — falta `superadmin`, que tem rota
  própria `/admin` e nunca deveria ver `/expenses`).

### 2.3 Arquivo de Dados (`/data-archive`) — zero cobertura, criar `19-data-archive.cy.ts`

- **Restrição de acesso**: só `admin` (`ROUTE_PERMISSIONS['/data-archive'] =
  ['admin']`, ver `AuthContext.tsx`) — testar `manager`, `cashier`, `waiter`,
  `kitchen`, `superadmin` todos bloqueados com "Acesso restrito", igual ao
  padrão do `18-expenses.cy.ts`.
- **Gerar relatório**: mock `fetchOrdersInRange`/`fetchShiftsInRange`/
  `fetchSecurityAlertsInRange` (interceptar `GET **/rest/v1/orders?*`,
  `shifts?*`, `security_alerts?*` com `range`/paginação — a função pagina em
  blocos de 1000 via `.range()`, então um único intercept que devolve `< 1000`
  linhas já encerra o loop) e `fetchFixedCosts` (`expenses`,
  `expense_amount_history`, `staff_salaries`) → depois de "Gerar relatório",
  os KPIs (Receita Total, Pedidos Pagos, Lucro Líquido) aparecem com os
  valores calculados a partir do fixture.
- **Filtro por mês**: selecionar um mês específico filtra `filteredOrders`
  para aquele mês apenas (`new Date(o.createdAt).getMonth() === month`).
- **Exportar sem dados**: com `filteredOrders.length === 0`, clicar
  PDF/Excel/CSV → toast "Sem dados para exportar no período selecionado", sem
  chamar `exportYearReportPDF`/`Excel`/`CSV` (spy).
- **Exportar com dados**: cada um dos três botões (PDF/Excel/CSV) chama a
  função de export correspondente com o payload esperado (`buildPayload()`).
  Ver §2.4 para o conteúdo interno de `exportYearReportExcel`.
- **Recibos do período**: "Recibos do período (HTML)" chama
  `downloadBatchReceiptsHTML` com `filteredOrders` e `rangeLabel` correto
  (ano sozinho, ou "Mês Ano" quando um mês está selecionado); marca
  `receiptsDownloaded = true`.
- **Gate de exclusão (`canDelete`)**: botão "Apagar dados antigos" começa
  `disabled`. Fica habilitado **só depois de**: (1) gerar relatório **e** (2)
  descarregar recibos — testar as três combinações incompletas (nenhum, só
  relatório, só recibos — este último impossível de alcançar pela UI já que o
  botão de recibos só aparece após `reportGenerated`, mas vale confirmar que a
  ordem importa) e a combinação completa.
- **Confirmação por texto exato**: digitar algo diferente de `APAGAR`
  (minúsculas, com espaço, `APAGAR ` com trailing space) mantém o botão de
  confirmação `disabled`; exatamente `APAGAR` habilita.
- **Invocação da edge function**: `cy.intercept('POST',
  '**/functions/v1/purge-old-data', ...)` — confirmar `body.tenantId` e
  `body.cutoffDate` (data calculada como "hoje - 1 ano", ver `cutoffDate`
  memoizado). Sucesso → toast com as três contagens
  (`ordersDeleted`/`shiftsDeleted`/`alertsDeleted`) interpoladas certo, campo
  de confirmação limpo, `fetchOrders`/`fetchShifts` e `refresh()` chamados
  (recarrega o catálogo local).
- **Falha da edge function**: intercept devolvendo erro → toast de falha,
  **não** limpa `confirmText` nem fecha o diálogo (permite o admin tentar de
  novo sem reescrever "APAGAR").
- **`monthsInSelection` (função pura, ideal para unit test isolado em vez de
  e2e)**: ano passado completo → 12; ano corrente → `now.getMonth() + 1`; ano
  futuro → 0; mês específico selecionado → sempre 1, independentemente do
  ano. Estes 4 casos batem exatamente com a árvore de `if` da função.

#### 2.3.1 `purge-old-data` — edge function, teste de integração (não cypress)

Mesmo padrão de "curl real contra projeto de teste" da revisão de segurança
anterior:
- **Sem Authorization header** → 401.
- **Sessão inválida** (token adulterado) → 401 "Invalid session".
- **Body inválido** (`tenantId` não-UUID, ou `cutoffDate` não-datetime) → 400
  com `fieldErrors` do Zod.
- **Chamador sem role admin/superadmin naquele tenant** → 403 "Sem permissão
  para apagar dados deste restaurante" — testar especificamente um `manager`
  do mesmo tenant (a função é **mais restrita** que `delete-staff-account`, que
  aceita manager — este teste garante que a diferença não foi perdida num
  refactor futuro).
- **`cutoffDate` manipulado para o futuro/hoje** (tentando apagar dados
  recentes) → o servidor sempre usa `min(requested, hoje - 1 ano)` — inserir
  um pedido de 6 meses atrás, chamar com `cutoffDate = amanhã`, confirmar que
  esse pedido **sobrevive** (não é apagado, porque o cutoff real ainda caiu em
  "hoje - 1 ano").
- **Cascata**: um pedido com `order_items`/`order_events` apagado por estar
  antes do cutoff — confirmar que os itens/eventos somem junto (FK `on delete
  cascade`), sem precisar de delete explícito nessas tabelas.
- **Tabelas fora do escopo nunca tocadas**: inserir `expenses`,
  `expense_amount_history`, `staff_salaries`, `customers` antigos (anteriores
  ao cutoff) e confirmar que sobrevivem à chamada — é a garantia central do
  comentário no topo do ficheiro ("NUNCA apaga...").

### 2.4 `serverClock.ts` — sem nenhum teste

Unit tests em `src/test/serverClock.test.ts`:
- `nowIso()` sem nunca chamar `syncServerClock()` → equivale a
  `new Date().toISOString()` (offset 0).
- Mockar `supabase.rpc('now_utc')` devolvendo um timestamp 10s à frente do
  relógio local → depois de `await syncServerClock()`, `nowIso()` devolve algo
  ~10s à frente de `Date.now()` (tolerância de alguns ms para o tempo de
  execução do teste).
- `supabase.rpc` devolve `error` → offset permanece `0` (não quebra, não
  lança).
- `data` não é uma data parseável (`NaN` em `new Date(data).getTime()`) →
  offset permanece inalterado, sem lançar.
- Chamar `syncServerClock()` duas vezes com respostas diferentes → o offset é
  **substituído**, não acumulado.

### 2.5 `client_updated_at` em `menu_items`/`inventory_items` (last-write-wins)

`store.test.ts` já tem uma asserção para `menuStore.update` (client_updated_at
vai no payload). Faltam, no mesmo ficheiro:
- **`inventoryStore.update`**: mesma asserção — `client_updated_at` presente
  no `row` enviado a `cloud('inventory_items').update(...)`, e a chamada usa
  `.guard('client_updated_at', ts).resource(id)` (mock do `cloud()` já
  registra `.guard`/`.resource` para `tableStore`/`orderStore` — replicar o
  mesmo spy para `inventory_items`).
- **`fetchMenu`/`fetchInventory` com edição pendente na fila**: simular uma
  entrada pendente em `outbox` para um `menu_item`/`inventory_item` e um
  refetch que traz uma versão do servidor **mais antiga** que a alteração
  pendente → `mergePending` deve preservar a versão local pendente, não
  sobrescrever com o refetch (mesmo comportamento que já existe para
  `orders`/`tables` — replicar o teste existente de `mergePending` para as
  duas tabelas novas).
- **Migration `20260821091000_menu_inventory_client_updated_at.sql`**: se
  houver suite de migração/schema (não vi uma no repo — só
  `schema_clean_install.sql`), confirmar que a coluna nasce com
  `default now()` e `not null`, e que registos pré-existentes não quebram o
  `alter table ... add column if not exists`.

### 2.6 `subscribeOperations` — refactor para referência-contada

`store.ts` mudou de "um canal por chamada" para "um canal por tenant,
compartilhado entre múltiplos assinantes" (`opsSubscriptions` Map). Isto é
exatamente o tipo de mudança que quebra silenciosamente sob concorrência.
Unit tests em `store.test.ts` (mockando `supabase.channel`):

- **Duas chamadas para o mesmo tenant**: `subscribeOperations(t, cb1)` e
  `subscribeOperations(t, cb2)` → `supabase.channel` é chamado **uma única
  vez** (não duas) — a segunda chamada reaproveita o canal existente.
- **Unsubscribe parcial**: cancelar a subscrição de `cb1` enquanto `cb2` ainda
  está ativa → `supabase.removeChannel` **não** é chamado ainda; um evento
  simulado no canal ainda dispara `cb2`.
- **Unsubscribe total**: cancelar `cb1` e `cb2` → `supabase.removeChannel` é
  chamado exatamente uma vez, e o `timer` pendente (debounce de 300ms) é
  limpo (`clearTimeout`) mesmo que um evento tenha acabado de chegar.
  Regressão a vigiar: o timer de debounce que dispara **depois** do último
  unsubscribe não deve tentar `fetchOrders`/`fetchTables` nem chamar
  callbacks removidos.
- **Dois tenants diferentes**: `subscribeOperations(tenantA, cb)` e
  `subscribeOperations(tenantB, cb)` → dois canais distintos
  (`ops-${tenantA}`, `ops-${tenantB}`), cada um com seu próprio Map entry.

---

## 3. Regressões a cobrir nas páginas grandes já alteradas

Estas mudanças não são features novas isoladas — são edições em páginas com
testes existentes, então o risco é quebrar um caso já coberto sem perceber.
Rodar a suite existente primeiro; os itens abaixo são o que a suite atual
**não** pega.

### 3.1 `ReportsPage.tsx` — lucro líquido com despesas fixas + IVA

`computeStats` ganhou dois parâmetros novos (`fixedCosts`, `ivaRate`, `days`)
e não é exportado — hoje só testável renderizando a página inteira. Recomendo
**exportar `computeStats`, `periodDays` e `ZERO_FIXED`** de `ReportsPage.tsx`
(ou mover para `src/lib/reportStats.ts`) especificamente para permitir testes
unitários diretos; sem isso, cada caso abaixo vira um teste de render pesado
com React Testing Library.

Casos (valores ilustrativos — ajustar às fixtures reais):
- **Sem despesas fixas nem IVA** (`fixedCosts = ZERO_FIXED`, `ivaRate = 0`):
  `profit === totalRevenue - totalCost` (comportamento antigo, pré-mudança —
  é a regressão mais importante de todas: tenants que nunca configuraram
  `/expenses` não podem ver o lucro mudar).
  Nota: `totalCost` já existia antes; confirmar que segue somando cada
  `linkedMenuItemIds` × `costPerUnit` × `usagePerServing` × `quantity`, item a
  item, sem dupla contagem quando um ingrediente está ligado a vários itens do
  menu (`inventory.forEach` dentro de `items.forEach` — se dois itens do
  pedido usam o mesmo ingrediente, cada um soma seu próprio custo, correto).
- **Despesas recorrentes prorateadas**: `recurringMonthly = 3000`, período de
  15 dias → `fixedCostsTotal` inclui `3000 * (15/30) = 1500` (não os 3000
  inteiros).
- **Despesa pontual não prorateada**: `oneTime = 5000` entra inteiro,
  independentemente da duração do período.
- **IVA sobre receita bruta**: `ivaRate = 17`, `totalRevenue = 10000` →
  `ivaAmount = 1700`, subtraído do lucro.
- **`periodDays` sem intervalo selecionado (preset "Tudo")**: usa o espaço
  entre o primeiro e o último pedido pago; **sem nenhum pedido pago**, cai no
  fallback fixo de 30 dias (evita divisão por zero / `Math.max(...[])` =
  `-Infinity`).
- **Comparação com período anterior**: `prevStats` usa `previousFixedCosts`
  buscado separadamente (`fetchFixedCosts` com `previousRange`) — confirmar
  que o lucro do período anterior reflete o valor da despesa **como estava
  então**, não o valor atual (é literalmente o propósito de
  `fetchFixedCosts`/`expense_amount_history` — ver §2.2 na parte de histórico).
- **`canFinancial = false`** (ex.: `manager` sem permissão `reports.financial`):
  `fetchFixedCosts` nem é chamado (early return no `useEffect`,
  `!canFinancial` → `ZERO_FIXED`) — confirmar que a rota não dispara uma
  chamada de rede desnecessária/indevida (RLS bloquearia mesmo, mas o teste
  documenta a intenção "não tentar sequer").
- **`superadmin` redirecionado**: o `if (user?.role === 'superadmin') return
  <Navigate .../>` foi movido para **depois** de todos os hooks (comentário
  explícito no diff sobre rules-of-hooks) — teste de regressão: renderizar
  `ReportsPage` como `superadmin` não deve lançar "Rendered fewer hooks than
  expected" (o tipo de erro que aconteceria se o early-return voltasse para
  antes dos hooks num refactor futuro).
- **Link para `/expenses`** e **link para `/data-archive`**: só aparecem para
  `user.role === 'admin'` (não `manager`, mesmo que `manager` tenha
  `reports.financial`).
- **Plano Básico**: `isBasic` → tela de upsell "Disponível no plano
  Profissional" em vez do relatório — já deve estar coberto por
  `14-billing-pricing.cy.ts`; confirmar que o teste ainda passa (mudou de
  posição no componente, não de comportamento).

### 3.2 `AppSidebar.tsx`

- **Badge de pedidos pendentes**: `pendingConfirmationOrders.length` (via
  `useRestaurant()`) aparece como badge vermelho no ícone/label de "Mesas"
  (`/tables`), em ambas as variantes desktop e mobile bottom-nav; `9+` quando
  `> 9`; badge some quando a contagem cai a 0. **Cuidado**: `useRestaurant`
  precisa expor `pendingConfirmationOrders` — confirmar a origem exata (é
  provavelmente `orders.filter(o => o.status === 'awaiting-confirmation')`,
  os pedidos vindos direto do cliente via QR/entrega) antes de escrever o
  fixture do teste.
- **Reports sempre visível**: a aba "Relatórios" deixou de ser filtrada por
  `isBasic` na sidebar (antes: escondida para plano Básico; agora: sempre
  visível, o gate de plano vive dentro da própria `ReportsPage`) — atualizar
  qualquer teste antigo que assumisse "Relatórios oculto no plano Básico" na
  sidebar (o gate agora é 100% da responsabilidade da página, não da nav).
- **Imagem de fundo (`backgroundImageUrl`)**: aplicada a `document.body`
  (efeito colateral fora da árvore React) — teste de unit/integração:
  montar `AppSidebar` com `settings.backgroundImageUrl` setado → `body.style.
  backgroundImage` contém a URL; desmontar o componente → estilo limpo
  (função de cleanup do `useEffect`). Atenção a testes que rodam em sequência
  no mesmo `jsdom` — sem o cleanup, um teste seguinte herdaria o `body.style`
  sujo.
- **Rótulo "Funcionários" → "Team"**: qualquer teste (unit ou e2e) que faça
  `cy.contains('Funcionários')`/`getByText('Funcionários')` para essa página
  agora falha — já vi isso em `StaffPage.tsx`/`AppSidebar.tsx`. Buscar por
  toda a suite (`grep -ri funcionário`) e trocar por "Team" onde o texto
  renderizado realmente mudou (o *conceito* de funcionário/role continua
  "Funcionário" em `ROLE_LABEL` de `ExpensesPage.tsx`, por exemplo — só o
  título da página e o item de nav mudaram).

### 3.3 `POSPage.tsx` — layout mobile do painel de pagamento

Mudança de puro CSS/estrutura (sem lógica nova), mas o parênteses fica
grande. Cobrir num teste e2e com viewport mobile (`cy.viewport('iphone-x')`
ou similar):
- Sem pedido selecionado: lista de "Pedidos Activos" visível, painel de
  pagamento escondido (`hidden lg:block`).
- Selecionar um pedido: painel de pagamento abre como overlay full-screen
  (`fixed inset-0 z-40`), lista de pedidos ativos esconde (`hidden lg:block`
  no container da lista).
- Botão "Voltar aos pedidos" (só visível mobile, `lg:hidden`) volta para a
  lista (`setSelectedOrderId(null)`).
- Em viewport desktop (`lg:` e acima), ambos os painéis ficam visíveis lado a
  lado simultaneamente, independente de haver seleção.
- Resumo do pedido (Subtotal/Desconto/Taxa de embalagem/Gorjeta/Total) migrou
  de posição (antes do bloco de cliente/fidelidade → depois) mas o conteúdo é
  o mesmo — reafirmar os valores calculados, não só a posição.
- Label de pontos de fidelidade: "ganha 1 ponto por cada N MT" — N agora é
  `Math.round(1 / POINTS_PER_MT)` em vez de uma constante fixa (`MT_PER_POINT`
  continua fixo para o valor de resgate) — testar com `POINTS_PER_MT` vindo de
  configurações de fidelidade não-triviais (ex.: `0.05` → "cada 20 MT") e o
  caso `POINTS_PER_MT === 0` → mostra "—" em vez de `Infinity`/`NaN`.

### 3.4 `MenuItemDialog.tsx`

- **Nome duplicado**: criar item com nome igual (case-insensitive, espaços nas
  pontas) a um item já existente no cardápio → toast
  `Já existe um item chamado "X" no cardápio`, `onSave` **não** é chamado.
  Editar o **próprio** item mantendo o nome (comparação exclui `m.id !==
  item?.id`) → passa normalmente, sem falso positivo.
- **Categoria "Bebidas"**: trocar a categoria de um item existente **para**
  "Bebidas" limpa `steps`/`temp`, e mantém só o primeiro ingrediente **se**
  ele já estava ligado ao inventário (senão, lista de ingredientes some
  inteira). Abrir um item que **já é** Bebidas (não trocar a categoria
  ativamente) não deve apagar nada ao simplesmente abrir o diálogo.
- **Vínculo de bebida ao inventário**: selecionar um item do inventário no
  select "Vincular ao Inventário" → texto de ajuda mostra
  "Cada pedido servido desconta {usagePerServing} {unit}..."; escolher "Sem
  ligação" limpa o vínculo (`ingredients = []`).
- **Herança de imagem**: vincular uma bebida a um item de inventário que tem
  `image` definido, quando o item do **menu** ainda não tem imagem própria →
  `image` do menu é preenchido com a imagem do inventário. Repetir o vínculo
  quando o item do menu **já tem** imagem própria → a imagem existente não é
  sobrescrita (`if (!image && inv.image) setImage(inv.image)`).

### 3.5 `SuperAdminPage.tsx`

- **Scroll automático da aba ativa**: trocar de aba (`Tabs value={activeTab}`)
  dispara `scrollIntoView` no trigger ativo — difícil de asserir
  significativamente em jsdom (já stubado como no-op em `setup.ts`); melhor
  como teste e2e visual/manual do que unit test.
- **Confirmação ao remover imagem preset**: clicar no ícone de lixeira de uma
  imagem da galeria agora abre um `AlertDialog` de confirmação
  ("Remover imagem?") em vez de apagar direto ao hover+clique — confirmar
  que `handlePresetDelete` só é chamado depois de "Remover" no diálogo, nunca
  no clique inicial.

### 3.6 `CustomersPage.tsx`

- Botão "Configurar" (atalho para a aba de configurações de fidelidade
  quando o programa está desativado) foi **removido**. Se existir um teste
  antigo clicando nesse botão, vai quebrar — confirmar que não há regressão
  funcional equivalente perdida (o caminho alternativo para configurar
  fidelidade continua existindo via `/settings` diretamente?).

---

## 4. Migrations novas — checklist de revisão/teste

Nenhuma suite de migração automatizada existe hoje (só
`schema_clean_install.sql` como fonte da verdade "instalação limpa"). Para
cada migration nova desta sessão, o mínimo é: aplicar contra uma cópia limpa
do schema e confirmar que não quebra `schema_clean_install.sql` nem falha em
dados pré-existentes.

- `20260818120000_expenses_and_salaries.sql` / `20260818130000_expense_
  salary_history.sql`: RLS admin-only em `expenses`/`staff_salaries`/
  `expense_amount_history` — testar (via curl/JWT de um `manager`) que um
  não-admin recebe RLS-deny tanto em `select` quanto em `insert`/`update`.
- `20260819080000_server_clock.sql` (função `now_utc`): confirmar que é
  `security definer`/`stable` conforme apropriado e **não** aceita nenhum
  parâmetro controlável pelo cliente (superfície de ataque nula, mas vale
  confirmar `grant execute ... to anon, authenticated`).
- `20260821090000_customer_order_idempotency.sql`: ver §2.1.1 (testes de
  integração dedicados).
- `20260821091000_menu_inventory_client_updated_at.sql`: ver §2.5.
- `20260821092000_public_branding.sql`: confirmar que `get_public_branding`
  **nunca** vaza campos sensíveis de `app_settings.data` (ex.: `mpesaNumber`,
  `bankAccount`, chaves de API) — testar chamando a RPC como `anon` contra um
  tenant com esses campos preenchidos e verificar que o JSON de resposta
  contém **só** as 9 chaves esperadas (`brandName`, `iconEmoji`, `iconUrl`,
  `primaryHue/Saturation/Lightness`, `backgroundHue/Saturation/Lightness`).
  Este é o teste de segurança mais importante desta migration — um `select *`
  acidental num refactor futuro da função vazaria dados de pagamento
  publicamente.

---

## 5. Excel export (`src/lib/exportExcel.ts`)

Sem CSV/PDF para comparar 1:1, mas a mesma estrutura de dados
(`YearReportPayload`) já é testada para CSV/PDF em `exportReports.ts` (se
houver testes lá — confirmar). Para `exportExcel.test.ts`:

- Espiar `XLSX.writeFile` (mock do módulo `xlsx`) e capturar o `workbook`
  passado — confirmar `wb.SheetNames` é exatamente `['Resumo', 'Vendas
  Mensais', 'Mais Vendidos', 'Categorias', 'Pagamentos', 'Despesas e
  Salários']`, nessa ordem.
- Conteúdo da folha "Resumo": valores batem com `p.stats.*`, arredondados
  para inteiro via `fmtMT` (sem casas decimais, exceto `Margem (%)` que
  mantém 1 casa).
- Nome do ficheiro: `relatorio-anual-{year}.xlsx` sem mês selecionado,
  `relatorio-anual-{year}-{monthLabel}.xlsx` com mês.
- `p.bestSellers`/`p.categoryData`/`p.paymentData` vazios → folhas existem
  mas com só o cabeçalho (sem lançar erro no `json_to_sheet([])`).

---

## 6. Ordem de execução sugerida

1. §2.1.2 e §2.4 (unit, sem dependências externas) — mais rápidos de escrever
   e já pegam bugs reais de lógica pura.
2. §2.5 e §2.6 (unit, `store.ts`) — mesma fixture/mock já usada em
   `store.test.ts`, custo marginal baixo.
3. §2.1 (cypress, fluxo do cliente) — maior risco de negócio, mas exige mais
   trabalho de setup (nenhum precedente de teste para rota pública).
4. §2.2 e §2.3 (cypress, completar `18-expenses` + criar `19-data-archive`) —
   seguem o padrão já estabelecido, baixo risco de setup.
5. §3.* (regressões) — rodar a suite existente primeiro; só escrever o que
   ela não pega.
6. §2.1.1, §2.3.1, §4 (integração real contra Postgres/edge functions) —
   exige projeto Supabase de teste; agendar como sessão dedicada, igual ao
   formato da revisão de segurança de 2026-08-12.
