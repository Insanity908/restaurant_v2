# Spec de funcionalidades — por ordem de facilidade

Deriva de `docs/analise-sistema.md`. Cada item tem: onde mexer, o que fazer,
e um critério simples de "está feito". Ordenado por esforço real (não por
importância) — dentro de cada nível, os itens já vêm mais ou menos pela
ordem que faz sentido implementar (dependências primeiro).

Nível de esforço:
- **T0 — Trivial**: minutos, sem ficheiros novos, sem migration.
- **T1 — Fácil**: UI pequena reaproveitando um padrão que já existe noutra
  página da mesma app.
- **T2 — Médio**: precisa de uma migration pequena e/ou uma página/tabela nova.
- **T3 — Médio-difícil**: novo subsistema, ou mexe em código central
  (sync/outbox, RLS de várias tabelas).
- **T4 — Difícil**: integração externa (hardware, push) ou muda lógica de
  negócio central do POS.

---

## T0 — Trivial ✅ feito (2026-08-22)

Todos implementados excepto T0.6 (ver nota abaixo). Verificado: `tsc --noEmit`
limpo e suite de testes completa (128/128) sem regressões.

**T0.6 saiu da lista**: `getMenuItemImage`/`imageMap` em `helpers.ts` **não é
código morto** — está em uso activo como `fallbackSrc` em `KitchenPage`,
`KitchenOrderDetail`, `MenuPage` (x2) e `TablesPage`. Removê-lo mudaria
comportamento visível (pratos com esses 4 nomes exactos perderiam a foto de
fallback), por isso passou a ser uma decisão de produto, não uma limpeza
trivial — fica de fora do T0.


### T0.1 Validação numérica no Inventário
**Onde**: `src/pages/InventoryPage.tsx` (formulário de item).
**Fazer**: adicionar `min={0}` aos inputs `type="number"` de
`costPerUnit`/`currentStock`/`minStock`, e replicar a validação já usada em
`TablesPage.tsx` (desabilitar "Guardar" se algum valor for negativo/inválido).
**Feito quando**: não é possível gravar um valor negativo nestes 3 campos.

### T0.2 `formatPrice` com locale explícito
**Onde**: `src/lib/helpers.ts`.
**Fazer**: `toLocaleString()` → `toLocaleString('pt-PT', ...)`, consistente
com `formatMT` já usado em `ReportsPage`/`DataArchivePage`.
**Feito quando**: o preço formata igual independentemente do locale do
dispositivo do utilizador.

### T0.3 Aviso em pop-up bloqueado (recibo/proforma)
**Onde**: `src/lib/receipt.ts`, `src/lib/receiptBatch.ts`, `src/lib/proforma.ts`.
**Fazer**: nos 3 sítios onde `window.open(...)` pode devolver `null`, trocar
`if (!w) return;` por `if (!w) { toast.error('Não foi possível abrir a janela de impressão — verifique se o navegador bloqueou o pop-up'); return; }`.
**Feito quando**: bloquear o pop-up mostra um erro em vez de não fazer nada.

### T0.4 Logo nos recibos em lote
**Onde**: `src/lib/receiptBatch.ts`.
**Fazer**: `buildReceiptHTML(o, { brand })` → passar também `logoUrl`
(já vem de `settings.receiptLogo`/`receiptShowLogo`, ver como `ReportsPage`/
`DataArchivePage` já invocam `downloadBatchReceiptsHTML`).
**Feito quando**: recibos gerados em lote mostram o logo, se configurado.

### T0.5 Validar telefone no Signup
**Onde**: `src/pages/SignupPage.tsx`.
**Fazer**: chamar `validateIntlPhone` (já existe em `src/lib/validators.ts`
e é usado noutros formulários de telefone) no campo de telefone antes de
submeter.
**Feito quando**: um telefone inválido no signup mostra erro, como já
acontece nos outros formulários da app.

### T0.6 Limpar `imageMap` de demo em `helpers.ts`
**Onde**: `src/lib/helpers.ts`.
**Fazer**: remover o mapa de imagens fixas para pratos-exemplo
("Pizza Pepperoni" etc.) se não estiver a ser usado fora de dados de demo —
confirmar primeiro com um grep a quem importa isto antes de apagar.
**Feito quando**: `grep -rn imageMap src/` só aparece na definição, ou o
código morto foi removido.

---

## T1 — Fácil ✅ feito (2026-08-22)

Todos os 8 itens implementados, mais uma funcionalidade extra pedida à parte:
**mostrar/esconder password** — novo componente `src/components/ui/password-input.tsx`
(drop-in por cima do `Input` existente, com botão de olho), aplicado aos 4
campos de password da app (`LoginPage`, `SignupPage`, `OnboardingPage`,
`StaffPage`). Testado com 2 testes unitários novos
(`src/test/passwordInput.test.tsx`).

**T1.5 nota**: implementei a FAQ (accordion) mas **não** o botão WhatsApp
"Fale connosco" — o número do superadmin (`system_payment_accounts`) só é
legível por `admin`/`superadmin` autenticados (RLS confirmada no schema),
nunca por `anon`. Expor isso na Landing pública exigiria uma RPC pública
nova (T2, não T1) — fica registado como pendente, não descartado.

Verificado: `tsc --noEmit` limpo e suite de testes completa (130/130) sem
regressões.

## T1 — Fácil (padrão já existe noutra página)

### T1.1 Confirmação ao apagar mesa (trocar `window.confirm`)
**Onde**: `src/pages/TablesPage.tsx`.
**Fazer**: trocar o `window.confirm()` nativo por um `AlertDialog`, copiando
o padrão já usado em `ExpensesPage.tsx`/`DataArchivePage.tsx`. Bloquear
também quando a mesa tem um pedido **pendente de confirmação** (hoje só
bloqueia se `occupied`).
**Feito quando**: apagar mesa usa o mesmo `AlertDialog` estilizado do resto
da app, e mesas com pedido QR por confirmar não podem ser apagadas.

### T1.2 Confirmação ao apagar item de inventário
**Onde**: `src/pages/InventoryPage.tsx`.
**Fazer**: envolver o botão de apagar num `AlertDialog` (mesmo padrão do
T1.1); se `linkedMenuItemIds.length > 0`, incluir na descrição do diálogo
quais pratos ficam sem este ingrediente ligado.
**Feito quando**: apagar um ingrediente pede confirmação e avisa se está
ligado a pratos do menu.

### T1.3 Confirmar "Concluir Todos" na Cozinha
**Onde**: `src/pages/KitchenPage.tsx`.
**Fazer**: `AlertDialog` antes de aplicar a mudança de status em massa
("Iniciar Todos"/"Concluir Todos"/"Servir Todos") quando o pedido tem mais
de 1 item.
**Feito quando**: um clique acidental num pedido com vários itens não avança
tudo sem confirmação.

### T1.4 Páginas estáticas de Termos e Privacidade
**Onde**: novo `src/pages/TermsPage.tsx`/`PrivacyPage.tsx` + rotas em
`src/App.tsx` + link no rodapé de `LandingPage.tsx`.
**Fazer**: conteúdo estático (texto simples), sem lógica — o mais rápido de
todo o T1 dado que não depende de nenhum outro sistema.
**Feito quando**: os links existem e abrem páginas com conteúdo real (não
placeholder).

### T1.5 FAQ na Landing Page
**Onde**: `src/pages/LandingPage.tsx`.
**Fazer**: secção de perguntas frequentes (accordion, já há o componente UI
`accordion` nas dependências do projecto) + botão WhatsApp "Fale connosco"
reaproveitando o padrão `wa.me` já usado em `CustomersPage.tsx`.
**Feito quando**: a landing tem uma secção FAQ visível e um contacto directo.

### T1.6 Aviso proactivo de expiração de plano
**Onde**: `src/components/AppSidebar.tsx` ou `src/pages/DashboardPage.tsx`.
**Fazer**: banner dismissable (reaproveitar `DismissibleAlert.tsx`, já usado
em `InventoryPage`/`KitchenPage`) quando `daysLeft <= 7`, além do badge
pequeno que já existe.
**Feito quando**: faltando poucos dias para expirar, aparece um aviso visível
na página principal, não só na sidebar.

### T1.7 Notificação de nova versão da PWA
**Onde**: `src/lib/registerSW.ts`.
**Fazer**: ligar os callbacks `onNeedRefresh`/`onOfflineReady` do
`virtual:pwa-register` a um toast simples ("Nova versão disponível —
Actualizar", botão chama `updateSW()`).
**Feito quando**: publicar uma nova versão faz aparecer o aviso num
dispositivo com a app já aberta.

### T1.8 Som de alerta na Cozinha
**Onde**: `src/pages/KitchenPage.tsx`.
**Fazer**: um `<audio>` curto disparado nos mesmos pontos onde já há toast
de "pedido novo"/atraso (reaproveitar a lógica de alerta já existente, só
adicionar o som).
**Feito quando**: um pedido novo/atrasado toca um som audível, não só o
toast visual.

---

## T2 — Médio (migration pequena e/ou página nova)

**T2.1, T2.2 e T2.3 ✅ feito (2026-08-22)** — ver notas em cada item abaixo.

**Nota de processo importante**: descobri neste ponto que `npx tsc --noEmit -p .`
(o comando usado para "verificar" T0/T1/T2.1/T2.2) não verifica **nada** —
`tsconfig.json` na raiz tem `"files": []` e só `references`, e sem a flag
`-b`/`--build` o TypeScript não segue as referências. Confirmado injectando
um erro de tipo propositado e vendo o comando continuar a reportar sucesso.
O comando correcto é `npx tsc --noEmit -p tsconfig.app.json`. Corrido contra
uma árvore limpa (antes de qualquer mudança do T2.3), encontrou 9 erros
pré-existentes, sem relação com este trabalho excepto um: `BillingPlan` em
`src/types/restaurant.ts` não incluía os planos `basic-*`, o que já estava a
causar erros silenciosos em `src/lib/billing.ts` — corrigido como parte do
T2.3 porque estava directamente no caminho. Os restantes 4 erros
pré-existentes (não corrigidos, fora do âmbito do T2) ficam documentados:
`useRestaurant.ts:174` (narrowing de union `{ok}|{ok,error}`),
`customerOrder.ts:48` e `storage.ts:118` (cast de `Json[]` sem passar por
`unknown`), `authContext.test.tsx:30` (mock com union incluindo `undefined[]`).
Verificado a partir daqui com o comando correcto: `tsc -p tsconfig.app.json`
sem novos erros introduzidos, e suite de testes completa (134/134, 1 falha
de timing em `store.test.ts` confirmada como flaky ao correr isolada) sem
regressões.

### T2.1 Remover vestígios do Stripe
**✅ feito** — removida a aba "Faturação SaaS" de `SettingsPage.tsx`,
`BillingSuccessPage.tsx` apagada, `src/lib/billing.ts` sem nenhum campo
`stripe_*`/`STRIPE_PUB_KEY`, rota `/billing/success` removida de `App.tsx` e
de `RequireLicense.tsx`. `grep -rn -i stripe src/` já não devolve nada.
**Onde**: `src/pages/SettingsPage.tsx` (aba "Faturação SaaS"),
`src/pages/BillingSuccessPage.tsx`, `src/lib/billing.ts` (campos
`stripe_link_*`/`STRIPE_PUB_KEY`), rota em `src/App.tsx`, e a coluna
correspondente em `billing_plans`/`platform_config` (migration a remover ou
apenas deixar de ler).
**Fazer**: decidir primeiro remover-vs-manter (ver §2.5 da análise); se
remover, apagar a aba, a página, os campos e os imports relacionados.
**Feito quando**: `grep -rn -i stripe src/` não devolve nada (ou só o que
ficou deliberadamente para reactivar no futuro, documentado como tal).

### T2.2 Fluxo de recuperação de password
**Onde**: novo `src/pages/ForgotPasswordPage.tsx` + rota em `src/App.tsx` +
link em `LoginPage.tsx`.
**Fazer**: `supabase.auth.resetPasswordForEmail(email)` (API nativa,
já disponível na versão do supabase-js usada) + página de "verifique o seu
email" + página de definir nova password (`supabase.auth.updateUser`).
**Feito quando**: um utilizador consegue repor a password sem intervenção
manual na base de dados.

**✅ feito** — `AuthContext.tsx` ganhou `requestPasswordReset`/`updatePassword`;
`ForgotPasswordPage.tsx` (novo) nunca revela se o email existe ou não, só
confirma "se existir conta, vai receber um link"; `ResetPasswordPage.tsx`
(novo) valida password ≥8 caracteres + confirmação, e força `logout()` após
sucesso para obrigar novo login já com a password nova. Link "Esqueci a
password" em `LoginPage.tsx`. 4 testes novos em
`src/test/passwordReset.test.tsx` cobrindo os dois métodos (sucesso + erro).

### T2.3 `subscription_history` guarda o preço pago (snapshot)
**Onde**: migration nova (adicionar coluna `price` a `subscription_history`),
`src/lib/tenants.ts` (o insert de histórico ao activar/renovar plano),
`src/pages/BillingPage.tsx` (`totalPaid` passa a somar a coluna, não
`PLANS[plan].price` actual).
**Feito quando**: mudar um preço em `PLANS`/`billing_plans` não altera o
"total pago" de subscrições já registadas.

**✅ feito** — nova migration `20260822140000_subscription_history_price_snapshot.sql`
(coluna `price numeric`, nullable — histórico anterior fica sem snapshot, cai
para o preço actual como aproximação em `BillingPage.tsx`). A edge function
`subscription-status` lê o preço de `billing_plans` **no servidor** (nunca
confia num preço vindo do cliente, para não ser falsificável) e grava-o na
mesma inserção do histórico. Aplicado à produção (`db push --linked` +
`functions deploy`).

### T2.4 Editar turno manualmente
**Onde**: `src/pages/ShiftsPage.tsx`, `src/hooks/useRestaurant.ts` ou
`src/lib/store.ts` (`shiftStore` precisa de um `update` exposto à UI, se
ainda não houver).
**Fazer**: botão "Editar" por linha do histórico (só managers/admin),
`Dialog` simples com `clockIn`/`clockOut` editáveis.
**Feito quando**: um manager consegue corrigir a hora de saída de um turno
esquecido "Em curso".

**✅ feito** — `shiftStore.update` já existia (sincroniza com `shifts` na
cloud); adicionado botão "Editar" por linha (só visível com permissão
`shifts.manage`) que abre um `Dialog` com `clockIn`/`clockOut` em
`<input type="datetime-local">`, validando que a saída é sempre depois da
entrada. Deixar a saída em branco mantém o turno "Em curso". 3 testes novos
em `src/test/shiftsPageEdit.test.tsx`.

### T2.5 Filtro por data + exportação em Turnos
**Onde**: `src/pages/ShiftsPage.tsx`, reaproveitando `exportReportsCSV`/PDF
de `src/lib/exportReports.ts` como referência de padrão.
**Feito quando**: dá para filtrar turnos por intervalo de datas e exportar o
resultado, como já existe em Relatórios.

**✅ feito** — dois `<input type="date">` (de/até) filtram só a tabela de
histórico (os cartões de "hoje" no topo continuam relativos ao dia actual),
mais um botão "Exportar CSV" (`exportShiftsCSV` novo em
`src/lib/exportReports.ts`, mesmo padrão `Blob`+`downloadBlob` de
`exportReportsCSV`). 3 testes novos em `src/test/exportShifts.test.ts`
(inspecionam o `Blob` real gerado, não uma aproximação).

### T2.6 Paginação em Clientes
**Onde**: `src/pages/CustomersPage.tsx` (`CustomerGrid`).
**Fazer**: paginação client-side simples (a lista já vem toda para o
cliente via local-first; não precisa de paginação no servidor) ou
virtualização se a lista for muito grande.
**Feito quando**: uma base de milhares de clientes não degrada a página.

**✅ feito** — `CustomerGrid` (reutilizado pelas 3 abas: Todos/Fidelidade/
Aniversariantes) pagina a 24 cartões por página, com "Anterior"/"Seguinte" +
indicador "Página X de Y". Reinicia para a página 1 quando o número de itens
muda (pesquisa, troca de aba), mas não a cada refresh em tempo real com a
mesma contagem, para não saltar o utilizador de volta enquanto navega. 3
testes novos em `src/test/customersPagination.test.tsx` — confirmei que
falham genuinamente ao subir `CUSTOMERS_PAGE_SIZE` para um valor grande
(sem paginação), antes de reverter.

### T2.7 Histórico de ajustes de fidelidade
**Onde**: migration nova (tabela `loyalty_points_history`, mesmo padrão de
`expense_amount_history`), `src/lib/store.ts`/`customerStore` ou um novo
`src/lib/loyaltyHistory.ts`, `src/pages/CustomersPage.tsx` (registar ao
`addBonus`/`redeem`, mostrar histórico por cliente).
**Feito quando**: cada bónus/resgate fica registado com quem/quando/quanto,
visível no perfil do cliente.

**✅ feito** — nova tabela `loyalty_points_history` (append-only, mesmo
padrão de `expense_amount_history`), novo `src/lib/loyaltyHistory.ts`
(`recordLoyaltyAdjustment`/`fetchLoyaltyHistory`). `CustomerDetailDialog`
mostra o histórico (delta, motivo, quem, quando) por baixo dos botões de
bónus/resgate — a entrada aparece de imediato ao clicar (o envio para a
nuvem é fire-and-forget via outbox, por isso a UI não espera por ele).
Migration aplicada à produção. 3 testes novos em
`src/test/loyaltyHistory.test.tsx`.

### T2.8 Passo 3 no Onboarding: cardápio e mesas
**Onde**: `src/pages/OnboardingPage.tsx`.
**Fazer**: depois de convidar a equipa, um ecrã com dois atalhos grandes
("Configurar cardápio" → `/menu`, "Configurar mesas" → `/tables`), ou
opcionalmente pré-carregar 2-3 itens de exemplo editáveis.
**Feito quando**: o onboarding não termina mais num Dashboard vazio sem
próximo passo sugerido.

**✅ feito** — 3º passo com dois atalhos grandes ("Configurar cardápio" →
`/menu`, "Configurar mesas" → `/tables`) e um botão final "Ir para o
Dashboard". Tanto "Concluir" (com ou sem convites) como "Saltar" no passo 2
levam ao passo 3 em vez de navegar directo para "/". 4 testes novos em
`src/test/onboardingStep3.test.tsx`.

### T2.9 `CustomerTrackingPage` por Realtime em vez de polling
**Onde**: `src/pages/CustomerTrackingPage.tsx`.
**Fazer**: trocar o `setInterval` de 4s por uma subscrição Realtime à
tabela `orders` filtrada pelo `orderId`, seguindo o padrão já estabelecido
em `subscribeOperations` (`src/lib/store.ts`).
**Feito quando**: o estado do pedido actualiza sem esperar até 4s, e sem
pedidos de rede repetidos quando nada muda.

**✅ feito, com uma ressalva de verificação** — a página é pública/anon, e
`orders` só tem RLS para `authenticated`, por isso um `postgres_changes`
normal (o padrão de `subscribeOperations`) exigiria dar a `anon` uma
política de SELECT em `orders`, expondo a tabela toda (telefone do cliente,
notas, todos os pedidos do tenant). Em vez disso: **Realtime Broadcast
Authorization** — migration nova
`20260822160000_order_tracking_realtime_broadcast.sql` com um trigger em
`orders`/`order_items` que emite para o tópico `order:<uuid>` via
`realtime.broadcast_changes` (SECURITY DEFINER, com a própria excepção
engolida para nunca abortar a escrita real do pedido) + uma política em
`realtime.messages` que deixa subscrever tópicos `order:*` — só recebe quem
já souber o UUID (mesmo modelo de confiança da RPC `get_order_status` que já
existia). `CustomerTrackingPage.tsx` subscreve com `{config:{private:true}}`
e recarrega o estado a cada evento E sempre que o canal (re)conecta (não só
uma vez), porque broadcast não repõe eventos perdidos enquanto desligado.
**Verificado no lado da base de dados** com SQL directo em produção: um
UPDATE real em `orders`/`order_items` produz uma linha correcta em
`realtime.messages` com o tópico esperado. **Não verificado**: a
subscrição efectiva num browser real (recomendo confirmar manualmente
abrindo `/pedido/<id>` antes de divulgar). 4 testes novos em
`src/test/customerTrackingRealtime.test.tsx` (mockam `supabase.channel`).

### T2.10 Extrair lógica de fidelidade duplicada
**Onde**: `src/pages/CustomersPage.tsx` (`computeStats`) e
`src/lib/customerReport.ts` (`buildCustomerReport`) → extrair para
`src/lib/loyaltyStats.ts` (mesmo padrão do refactor `reportStats.ts` já
feito nesta sessão para Relatórios).
**Feito quando**: existe uma única função de cálculo de pontos/nível,
importada pelos dois sítios.

**✅ feito** — novo `src/lib/loyaltyStats.ts` com `computeCustomerLoyaltyStats`
(pedidos ligados por id/telefone, total gasto, última visita, pontos, nível),
com um parâmetro `range` opcional para o filtro de datas do relatório.
`CustomersPage.tsx` e `customerReport.ts` delegam ambos nele agora, cada um
mantendo só a sua própria diferença de apresentação (nível "Bronze" por
omissão no cartão vs. "—" no relatório). 8 testes novos em
`src/test/loyaltyStats.test.ts`.

---

## T2 — completo (2026-08-22)

Todos os 10 itens (T2.1–T2.10) implementados e verificados: `tsc --noEmit -p
tsconfig.app.json` sem novos erros (4 pré-existentes documentados em T2.1,
não relacionados com este trabalho) e suite de testes completa 162/162.
Migrations aplicadas à produção (`bbpfoygfxqwjqsolisqw`) e a edge function
`subscription-status` redesplegada. Única ressalva: T2.9 (Realtime na
página pública de tracking) está verificado ao nível da base de dados mas
não foi confirmado num browser real — ver nota nesse item.

---

## T3 — Médio-difícil (subsistema novo ou mexe em código central)

### T3.1 Limite e purga na fila de sync (outbox)
**Onde**: `src/lib/outbox.ts`.
**Fazer**: cap de operações (ex.: 500), aviso quando perto do limite,
purga automática de operações com mais de N dias com registo explícito do
que foi descartado (não silencioso). Em "Limpar fila" (`SyncStatus.tsx`),
guardar um resumo (tabela/lista) do que foi apagado antes de confirmar.
**Cuidado**: é código central de sincronização — testar bem com
`outboxRace.test.ts` como referência, e não quebrar o comportamento actual
de last-write-wins.
**Feito quando**: um dispositivo offline prolongado não consegue rebentar o
`localStorage` sem aviso, e limpar a fila deixa rasto do que se perdeu.

**✅ feito** — duas defesas em `src/lib/outbox.ts`: purga automática de
operações com mais de `OUTBOX_MAX_AGE_DAYS` (7) dias sem sincronizar
(corre a cada ciclo de `flushOutbox`, mesmo offline), e um tecto rígido de
`OUTBOX_MAX_OPS` (500) que, ao ser ultrapassado, descarta primeiro as
operações já FALHADAS mais antigas (não bloqueiam o replay de mais nada) e
só recorre a descartar pendentes genuínas mais antigas no caso extremo de
não haver falhadas suficientes. Nunca silencioso: cada descarte regista na
consola e mostra um toast. `SyncStatus.tsx` mostra um aviso visível
("Fila muito grande") a partir de `OUTBOX_WARN_AT` (400), e o diálogo de
"Limpar fila" agora mostra um resumo por tabela (ex.: "2 Pedidos, 1 Turno")
antes de confirmar, não só uma contagem. A notificação (toast) deixou de
ser fire-and-forget — passou a `async`/`await`ada em toda a cadeia
(`notifyDiscarded` → `purgeStaleOps`/`enforceCap` → `enqueue` →
`queueWrite`/`flushOutbox`), o que também a tornou testável de forma
determinística. 11 testes novos (`src/test/outboxLimits.test.ts` +
`src/test/syncStatus.test.tsx`), e `outboxRace.test.ts` (a regressão mais
sensível de last-write-wins já existente) continua a passar sem alterações.

### T3.2 Notificação de comprovativos de pagamento / feedback
**Onde**: `supabase/functions/` (nova edge function, ou trigger em
`payment_submissions`/`feedback_submissions`), `src/lib/paymentSubmissions.ts`,
`src/lib/feedback.ts`.
**Fazer**: a opção mais simples é um email automático ao superadmin via
edge function chamada por um trigger de `insert`, sem precisar de push
nativo. Alternativa mais simples ainda: badge com contagem em tempo real na
sidebar do superadmin via Realtime (já há Realtime disponível no projecto).
**Feito quando**: o superadmin sabe que chegou algo novo sem ter de abrir a
página para verificar.

**✅ feito** — escolhida a alternativa mais simples do spec (badge Realtime,
não email): novo `src/hooks/useSuperAdminAlerts.ts`, que soma comprovativos
de pagamento pendentes + feedback por ler e só activa (query + subscrição)
quando o utilizador actual é superadmin. `payment_submissions`/
`feedback_submissions` adicionadas à publicação `supabase_realtime`
(migration `20260822170000_superadmin_alerts_realtime.sql`) — seguro usar
`postgres_changes` normal aqui (ao contrário do T2.9) porque a RLS destas
tabelas já restringe SELECT a `is_superadmin`, sem papel `anon` envolvido.
Badge ligado ao ícone "Super Admin" em `AppSidebar.tsx`, mesmo padrão visual
do badge de pedidos pendentes em "Mesas". 6 testes novos
(`src/test/superAdminAlerts.test.ts` + 2 em `appSidebar.test.tsx`).

### T3.3 `useLicense` por Realtime em vez de polling de 5 min
**Onde**: `src/hooks/useLicense.ts`.
**Fazer**: subscrever a tabela `subscriptions` filtrada pelo `tenant_id`
via Realtime (mesmo padrão de `subscribeOperations`), manter o polling só
como fallback mais espaçado (ex.: 30 min) em vez de fonte primária.
**Feito quando**: activar um plano no SuperAdmin reflecte-se no dono quase
instantaneamente, sem esperar o próximo poll.

**✅ feito** — `useLicense.ts` subscreve `postgres_changes` em `subscriptions`
filtrado por `tenant_id` (RLS já restringe a `is_tenant_member`/
`is_superadmin`, seguro sem Broadcast Authorization). Tabela adicionada à
publicação `supabase_realtime` (migration
`20260822180000_subscriptions_realtime.sql`). Polling passou de 5 para 30
minutos — deixa de ser a fonte primária, fica só como rede de segurança.

**🐛 CORRIGIDO (2026-08-22, revisão geral pós-T4.1)**: a versão original
abria `supabase.channel('license-<tenant>').on(...).subscribe()`
directamente DENTRO do hook. Como `useLicense()` é chamado de vários sítios
ao mesmo tempo na mesma página (`AppSidebar` + `RequireLicense` + a própria
página), a segunda chamada tentava reabrir um canal com o MESMO nome de
tópico — o supabase-js devolve o canal já existente em vez de criar um
novo, e chamar `.on()` nesse canal já subscrito rebentava com "cannot add
postgres_changes callbacks ... after subscribe()". Isto **partiu 15 dos 20
specs Cypress** (praticamente qualquer página com sidebar) — só apanhado
ao correr a suite e2e completa nesta revisão, não pelos testes unitários
(que mockavam `supabase.channel` sem replicar esse comportamento real).
`store.ts` já tinha o padrão certo documentado para isto
(`subscribeOperations`, canal partilhado com contagem de referências) —
`useLicense` devia tê-lo usado desde o início. Corrigido com um
`subscribeLicense` novo (mesmo padrão), e `useSuperAdminAlerts.ts` (T3.2)
blindado da mesma forma por precaução, já que tem a mesma forma
(actualmente só um sítio a chamá-lo, mas sem protecção se isso mudar).
Confirmado com Cypress a passar de 160/244 para 218/244 testes depois da
correcção (os ~26 que continuam a falhar são specs desactualizados
pré-existentes, testando UI removida como o campo `#username` — não
relacionados com esta sessão). 3 testes novos de regressão em
`store.test.ts` (dedup/contagem de referências), `useLicenseRealtime.test.ts`
reescrito para a nova forma.
4 testes novos em `src/test/useLicenseRealtime.test.ts`.

### T3.4 Histórico de movimentos de stock
**Onde**: migration nova (tabela `inventory_movements`), `src/lib/store.ts`
(`inventoryStore`), `src/pages/InventoryPage.tsx` (nova aba/secção de
histórico por item).
**Feito quando**: dá para ver quando/porque o stock de um item mudou, além
do valor actual.

**✅ feito** — nova tabela `inventory_movements`. A maioria dos movimentos
vem automaticamente do trigger já existente `deduct_inventory_on_order_item`
(dedução a cada venda) — estendido para também gravar o delta REAL
(`new_stock - old_stock`, não a fórmula teórica, porque `greatest(0, ...)`
pode clampar antes de zero) com `reason='Venda'` e `reference_id=order_id`.
Ajustes manuais feitos em `InventoryPage.tsx` (mudar "Stock Actual" no
diálogo de edição) registam `reason='Ajuste manual'` com quem editou, via
novo `src/lib/inventoryMovements.ts`. Botão "Histórico" novo por linha abre
um diálogo com a lista de movimentos. **Verificado directamente em produção**
com SQL: inseri um `order_item` real de teste, confirmei o stock deduzido
correctamente E a linha de movimento com o delta certo, depois limpei os
dados de teste. 8 testes novos (`src/test/inventoryMovements.test.ts` +
`src/test/inventoryHistory.test.tsx`).

### T3.5 Mover/juntar mesas
**Onde**: `src/hooks/useRestaurant.ts`, `src/pages/TablesPage.tsx`.
**Fazer**: acção "Mover pedido para..." (escolher outra mesa livre,
transferir `currentOrderId`/`tableId` do pedido), e opcionalmente "juntar"
duas mesas ocupadas num único pedido combinado.
**Feito quando**: um grupo que muda de mesa não obriga a cancelar e recriar
o pedido.

**✅ feito (só mover — "juntar" fica de fora, era opcional no spec)** — nova
`moveOrderToTable(orderId, newTableId)` em `useRestaurant.ts`: recusa se a
mesa de destino não estiver livre, senão transfere `tableId`/`tableNumber`
no pedido e `status`/`currentOrderId` nas duas mesas, preservando por
completo o histórico de eventos/reimpressões do pedido (não recria nada).
Botão "Mover mesa" novo em `TablesPage.tsx` (só aparece quando há pelo
menos uma mesa livre), abre um diálogo simples a listar os destinos
possíveis. **"Juntar mesas" foi deliberadamente descartado**: combinar dois
pedidos num só (itens duplicados, qual mesa/número fica, recalcular total)
é um sub-fluxo novo bem maior do que "mover", e o próprio spec já o
marcava como opcional — o critério "feito quando" (não obrigar a
cancelar/recriar ao mudar de mesa) fica cumprido só com o mover. 6 testes
novos (`src/test/useRestaurantMoveTable.test.ts` + 2 em
`ui-integration.test.tsx`).

### T3.6 Modo TV para a Cozinha
**Onde**: nova rota/variante de `src/pages/KitchenPage.tsx` (ex.: query
param `?tv=1` que esconde sidebar e amplia a grelha).
**Feito quando**: um monitor dedicado na cozinha mostra só o essencial, sem
navegação.

**✅ feito** — botão "Modo TV" novo no cabeçalho de `KitchenPage.tsx`
acrescenta `?tv=1` à URL (e "Sair do modo TV" remove); `App.tsx` esconde a
`AppSidebar` nessa combinação exacta de rota+parâmetro (lógica extraída
para a função pura `shouldHideSidebar`, exportada, para dar para testar sem
montar a app inteira). `PageShell` ganhou um prop `fullBleed` (usa a
largura toda do ecrã, sem a margem reservada à sidebar) que `KitchenPage`
activa em modo TV, e a grelha ganha uma coluna extra (`2xl:grid-cols-5`)
nesse modo, para ecrãs grandes. **Encontrada e corrigida uma regressão
real durante os testes**: dois testes já existentes (`a11y.test.tsx`,
`ui-integration-2.test.tsx`) renderizavam `<KitchenPage />` sem
`<MemoryRouter>` — passava a rebentar porque a página passou a usar
`useSearchParams`; corrigido envolvendo-os num `<MemoryRouter>`, como as
restantes páginas do mesmo ficheiro já faziam. 7 testes novos
(`src/test/kitchenTvMode.test.tsx` + `src/test/kitchenPageTvToggle.test.tsx`).

---

## T3 — completo (2026-08-22)

Todos os 6 itens (T3.1–T3.6) implementados e verificados: `tsc --noEmit -p
tsconfig.app.json` sem novos erros (mesmos 4 pré-existentes documentados em
T2.1) e suite de testes completa 203/203. Migrations aplicadas à produção
(`bbpfoygfxqwjqsolisqw`). Duas descobertas/descisões relevantes ao longo do
tier: T2.9/T3.2/T3.3 tiveram de escolher entre `postgres_changes` normal e
Realtime Broadcast Authorization consoante a RLS da tabela em causa
(documentado item a item); T3.5 descartou deliberadamente "juntar mesas"
(marcado como opcional no spec original).

---

## T4 — Difícil (integração externa ou lógica central do POS)

### T4.1 Dividir conta / pagamento parcial
**Onde**: `src/hooks/useRestaurant.ts` (`completeOrder`), `src/pages/POSPage.tsx`.
**Porquê é difícil**: `completeOrder` hoje assume sempre pagamento total de
um pedido inteiro — dividir exige repensar o modelo (pagamentos parciais
associados a um pedido, itens por pagar vs. já pagos, reimpressão de recibo
por parte) sem quebrar o fluxo actual de fidelidade/desconto/troco.
**Feito quando**: um pedido consegue ser fechado em duas ou mais parcelas,
cada uma com o seu método de pagamento.

**✅ feito** — desenho deliberadamente conservador para não mexer em
`completeOrder` (a função mais sensível do POS, já bem testada): nova
tabela `order_payments` (append-only, RLS via join a `orders`, mesmo
padrão de `order_events`) só regista o RASTO de como o total foi cobrado
(quem/quanto/método/quando) — `orders.total`/`payment_method`/`paid`
continuam a reflectir só o resumo final, exactamente como antes. Nova
`addPartialPayment(orderId, method, amount, targetTotal)` em
`useRestaurant.ts` valida (pratos todos servidos, valor > 0, não excede o
que falta, pedido ainda não pago) e só grava a parcela — quando as parcelas
somam o total, o próprio `POSPage.tsx` chama `completeOrder` normalmente
(inalterado), com o método da última parcela, reaproveitando por completo
a lógica de desconto/fidelidade/troco já existente sem duplicar nada.
Também: `removeLastPayment` para desfazer um engano (só a parcela mais
recente, sem ambiguidade). Toggle "Dividir conta" novo em `POSPage.tsx`.
**Simplificação conhecida, aceite conscientemente**: o recibo impresso
continua a mostrar só `paymentMethod` (o método da última parcela), não a
repartição completa — quem quiser o detalhe vê os `order_payments` no
histórico do pedido. **Verificado directamente em produção** com SQL:
insert válido, `check (amount > 0)` a rejeitar um valor negativo, e select
correcto contra uma encomenda real. 10 testes novos
(`src/test/useRestaurantPartialPayment.test.ts` + 3 em
`ui-integration-2.test.tsx`), suite completa 213/213 sem regressões no
fluxo de pagamento único já existente.

**T4.2 (impressão térmica) e T4.3 (push) ficam por agora** — descartados
deliberadamente nesta passagem por precisarem de hardware real (impressora
térmica) e infraestrutura nova com segredos (chaves VAPID) que só ficam
verdadeiramente confirmados num dispositivo real, fora do alcance deste
ambiente. Retomar quando o utilizador tiver forma de testar contra
hardware/dispositivo real.

**🐛 Bug real encontrado e corrigido durante o T4.1 (2026-08-22)**: ao dar
`OrderPayment.id` a `generateId()` de `useRestaurant.ts`, reparei que essa
função NUNCA produzia um UUID real (só `store.ts` tinha a versão que
prefere `crypto.randomUUID()`) — duplicação de lógica já apontada em
`analise-sistema.md` §2.12. Isto não era só um problema de estilo:
`syncOrderEvents`/`syncOrderPayment` regeneram um UUID novo sempre que o
id recebido não é válido, e como `order_events` é só upsert (nunca apaga
linhas antigas), cada vez que um evento novo era acrescentado a um pedido,
TODOS os eventos anteriores desse pedido eram reinseridos como duplicados.
**Confirmado em produção com SQL**: 242 linhas em `order_events`, só 157
únicas — um pedido tinha 30 linhas para o que deviam ser ~10 transições
reais. Corrigido consolidando num só `generateId()` (exportado de
`store.ts`, `useRestaurant.ts` deixou de ter a sua cópia) — daqui para a
frente todos os ids gerados no cliente são UUIDs reais, incluindo os de
`OrderItem`/`OrderPayment` que passam por `useRestaurant()`. **Limpeza
aplicada em produção (2026-08-22, aprovada pelo utilizador)**: `delete`
mantendo uma linha por grupo `(order_id, type, item_id, item_name, at)` —
242 → 157 linhas (85 duplicados removidos). Confirmado: o pedido mais
afectado tinha 30 linhas, ficou com 9 (número real de transições).

### T4.2 Impressão térmica ESC/POS directa
**Onde**: novo módulo (ex.: `src/lib/thermalPrint.ts`), provavelmente via
Web Bluetooth API (browsers compatíveis) ou uma app companion.
**Porquê é difícil**: Web Bluetooth tem suporte limitado em iOS/Safari;
pode exigir uma app nativa/companion para cobrir todos os dispositivos, o
que sai fora do âmbito de "só código web".
**Feito quando**: um recibo imprime directamente numa impressora térmica
sem passar pelo diálogo de impressão do browser.

### T4.3 Notificações push reais (Web Push)
**Onde**: `src/lib/registerSW.ts` (Service Worker já existe, é o pré-requisito),
nova infraestrutura de subscrição push + edge function para enviar.
**Porquê é difícil**: exige VAPID keys, gestão de subscrições por
dispositivo, e uma função de envio — mais infraestrutura nova do que
qualquer outro item desta lista.
**Feito quando**: um dispositivo fechado recebe uma notificação (ex.:
"pedido pronto", "novo comprovativo de pagamento") mesmo sem a app aberta.

**Spec detalhada (2026-08-26)**: ver `docs/spec-push-notificacoes-permissoes.md`
— plano completo (migração do SW para `injectManifest`, chaves VAPID,
tabela `push_subscriptions`, edge function `send-push`, gatilhos por
evento) mais um levantamento à parte de permissões de funcionário que
faltam/estão mortas no sistema actual (`src/lib/permissions.ts`), já que os
gatilhos de push dependem delas para decidir quem recebe cada notificação.

---

## Ordem sugerida de execução

Dado que ainda não há clientes reais, o mais valioso é fazer **T0 inteiro
primeiro** (é literalmente grátis, sem risco) e depois avançar por T1/T2 até
onde o tempo permitir antes de divulgar o produto — nenhum item de T3/T4 é
bloqueador para o primeiro cliente real, mas T3.1 (limite da fila de sync) e
T2.2 (reset de password) são os dois que mais compensa adiantar cedo, dado
o contexto de rede instável e o risco de um admin ficar bloqueado fora da
própria conta.
