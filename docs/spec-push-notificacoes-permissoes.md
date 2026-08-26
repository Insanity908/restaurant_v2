# Spec: Notificações Push + Permissões em falta

Expande o item **T4.3** de `spec-funcionalidades.md` (hoje só um esboço de 3
linhas, deliberadamente adiado por precisar de infraestrutura nova e
dispositivo real para validar) num plano acionável, e levanta as
**permissões que existem no papel mas não estão realmente ligadas a nada**
(ou que faltam por completo) no sistema de permissões por funcionário
(`src/lib/permissions.ts`).

As duas partes são independentes — dá para fazer só a B (permissões) sem a
A (push), mas não o inverso: os gatilhos de push da secção A.7 assumem que a
permissão certa já existe para decidir quem recebe cada notificação.

---

## Parte A — Notificações Push (Web Push)

### A.0 O que já existe hoje

- **Service Worker já registado**: `src/lib/registerSW.ts` chama
  `virtual:pwa-register`, gerado pelo plugin `VitePWA` (`vite.config.ts`).
- **Estratégia actual é `generateSW`** (o default do plugin — não há
  `strategies: 'injectManifest'` em `vite.config.ts`): o `sw.js` é
  inteiramente auto-gerado pelo Workbox a partir de `globPatterns` +
  `runtimeCaching`. **Isto não suporta código próprio no service worker** —
  não há como acrescentar um listener de `push` ou `notificationclick` sem
  mudar de estratégia. É o primeiro obstáculo real, antes de qualquer outra
  coisa nesta secção.
- Não existe hoje nenhuma tabela de subscrições push, nenhuma edge function
  de envio, e nenhuma chave VAPID configurada em lado nenhum do repo.
- Já existe um padrão de alerta em tempo real *dentro da app aberta*
  (`useSuperAdminAlerts`, Realtime — comprovativos de pagamento + feedback
  por ler) e um aviso in-app de licença a expirar
  (`DashboardPage.tsx:14`, `showExpiryWarning`). Push é o complemento para
  quando a app **não** está aberta — não substitui esses alertas in-app,
  soma-se a eles.

### A.1 Migrar o Service Worker de `generateSW` para `injectManifest`

**✅ Implementada (2026-08-26)**. `vite.config.ts` usa
`strategies: 'injectManifest'`, `srcDir: 'src'`, `filename: 'sw.ts'`; o
bloco `workbox: {...}` (só válido em `generateSW`) foi removido. Novo
`src/sw.ts` recria manualmente: precache (`precacheAndRoute` +
`cleanupOutdatedCaches`), a mesma rota `NetworkFirst` de navegação
(`html-navigations`), `CacheFirst` para `/assets/` e para
`supabase.co/storage/`, e um `setCatchHandler` com
`createHandlerBoundToURL('/index.html')` como equivalente ao antigo
`navigateFallback` (só entra quando a rota de navegação falha — deep-link
nunca visitado, offline). Acrescenta os listeners `push` e
`notificationclick` (este último já implementa o deep-link de A.8).
`tsconfig.sw.json` novo (lib `WebWorker`, sem DOM) referenciado em
`tsconfig.json`; `src/sw.ts` excluído de `tsconfig.app.json`. Dependências
`workbox-*` (precaching/routing/strategies/expiration/cacheable-response/
core) passaram de transitivas (via `vite-plugin-pwa`) a directas no
`package.json`, na mesma versão já resolvida (7.4.1) — `sw.ts` importa-as
directamente. Verificado: `npm run build` gera `dist/sw.js` em modo
`injectManifest` (101 entradas precache) já com `push`/`notificationclick`
no bundle final; `tsc -p tsconfig.sw.json` e `tsc -p tsconfig.app.json`
limpos (os 4 erros que `tsconfig.app.json` mostra são pré-existentes,
sem relação com esta mudança); suite de testes sem regressão (220/222,
os 2 falhos são flakiness pré-existente de
`reportsPageFullRangeFetch.test.tsx`, confirmado a passar isolado).
Ainda por fazer dentro de A.1: nenhuma subscrição real existe ainda
(A.2–A.6), por isso os listeners `push`/`notificationclick` não foram
exercitados por uma notificação real — só confirmados presentes no bundle.

**Onde**: `vite.config.ts`, novo ficheiro `src/sw.ts`.
**Fazer**:
- Trocar o bloco `VitePWA({...})` para `strategies: 'injectManifest'`,
  `srcDir: 'src'`, `filename: 'sw.ts'`, e mover `globPatterns`/
  `navigateFallback`/`navigateFallbackDenylist` para dentro de
  `injectManifest: { ... }` (a API muda ligeiramente entre as duas
  estratégias — confirmar contra a versão instalada de `vite-plugin-pwa`).
- `src/sw.ts` novo: `import { precacheAndRoute } from 'workbox-precaching'`,
  `precacheAndRoute(self.__WB_MANIFEST)` (substitui o que o `generateSW`
  fazia automaticamente), mais os listeners novos de `push` e
  `notificationclick` (ver A.4/A.8).
- Este ficheiro corre fora do `tsconfig.app.json` (contexto `WorkerGlobalScope`,
  não DOM) — precisa do seu próprio `tsconfig` (ou `/// <reference lib="webworker" />`
  + exclusão explícita do `tsconfig.app.json`) para não quebrar
  `tsc -p tsconfig.app.json` (o comando real de type-check deste projecto,
  não `tsc -p .` — ver nota já registada sobre isto).
**Feito quando**: `npm run build` gera um `dist/sw.js` que ainda faz cache
igual ao actual (navegação offline continua a funcionar, testar como hoje)
e adicionalmente já tem os listeners de `push`/`notificationclick` (mesmo
que ainda não estejam a ser exercitados por nenhuma subscrição real).

### A.2 Chaves VAPID

**✅ Implementada (2026-08-26)**. Par gerado com `npx web-push
generate-vapid-keys`. Privada + `VAPID_SUBJECT` (`mailto:JSajapy@gmail.com`)
definidos como secrets do projecto Supabase `bbpfoygfxqwjqsolisqw`
(produção) via `supabase secrets set`, confirmados por `supabase secrets
list` (não em nenhum ficheiro do repo). Pública em `VITE_VAPID_PUBLIC_KEY`
no `.env` local (gitignored).

**Fazer**: gerar um par de chaves com `npx web-push generate-vapid-keys`.
- **Privada**: guardar como *secret* da Edge Function (`supabase secrets set
  VAPID_PRIVATE_KEY=...`), nunca no código nem em `.env` versionado.
- **Pública**: pode ir para uma variável `VITE_VAPID_PUBLIC_KEY` (é pública
  por natureza — o browser precisa dela para `pushManager.subscribe`).
- Definir também `VAPID_SUBJECT` (ex.: `mailto:suporte@saborpos.app`),
  exigido pelo protocolo Web Push.
**Feito quando**: as 3 variáveis existem (2 como secret da função, 1 como
env do build) e não há chave privada em nenhum ficheiro do repo.

### A.3 Tabela `push_subscriptions` (migration)

**✅ Implementada (2026-08-26)**. Migration
`supabase/migrations/20260826100000_push_subscriptions.sql` aplicada em
produção via `supabase db push` (confirmado por `supabase migration list`:
`local`==`remote`). Usa `public.is_tenant_member(tenant_id)` no `WITH CHECK`
(em vez do subquery cru a `tenant_members` do rascunho original), seguindo
o padrão real do resto do schema.

**RLS confirmada por teste directo real** (não só revisão de código): duas
contas reais criadas via `/auth/v1/signup`, cada uma com o seu próprio
tenant via `bootstrap-tenant` (o mesmo caminho que um signup real usa —
sem SQL directo, sem `service_role`), cada uma a inserir a sua própria
subscrição via REST com o seu próprio JWT. Resultado: `select` só devolve
a própria linha a cada uma; leitura da linha do outro por `id` devolve
`[]`; `delete` da linha do outro afecta 0 linhas (linha sobrevive,
confirmado a seguir); cada uma conseguiu apagar a própria subscrição no
fim. Dados de teste das subscrições foram limpos; os 2 tenants/contas de
teste (`__RLS_TEST_A__`/`__RLS_TEST_B__`) ficaram por limpar em produção
por decisão do utilizador (sem impacto real — trial vazio, ninguém os vê).

**Onde**: nova migration em `supabase/migrations/`.
**Fazer**: seguir exactamente o padrão de `staff_permissions`
(`20260712113233_..._.sql:261-270`) — `staff_id` referencia `auth.users(id)`,
não uma tabela `staff` própria (não existe; `Staff.id` no cliente **é** o
`auth.users.id`):

```sql
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  staff_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth_key text not null,
  user_agent text,
  created_at timestamptz not null default now()
);
create index idx_push_subscriptions_tenant on public.push_subscriptions(tenant_id);
create index idx_push_subscriptions_staff on public.push_subscriptions(tenant_id, staff_id);
alter table public.push_subscriptions enable row level security;

-- cada funcionário só vê/gere as suas próprias subscrições (um dispositivo)
create policy "staff manage own push subscription"
on public.push_subscriptions for all to authenticated
using (staff_id = auth.uid())
with check (staff_id = auth.uid() and tenant_id in (select tenant_id from public.tenant_members where user_id = auth.uid()));

-- a função de envio usa a service role, que ignora RLS — não precisa de policy extra
```

**Porquê `unique(endpoint)` e não `unique(tenant_id, staff_id)`**: a mesma
pessoa pode ter várias subscrições (telemóvel + desktop); o `endpoint`
identifica o dispositivo/navegador de forma única — reinscrever o mesmo
dispositivo faz `upsert` por `endpoint`, não duplica.
**Feito quando**: migration aplicada, RLS confirmada por teste directo (um
funcionário não consegue ler o `endpoint`/`p256dh` de outro via `select`).

### A.4 Cliente — `src/lib/pushNotifications.ts` (novo)

**✅ Implementada (2026-08-26)**. Expõe exactamente as 4 funções previstas
mais `hasActiveSubscription()` (para a UI saber o estado real ao abrir,
independente da permissão do browser). `subscribeToPush({tenantId,
staffId})` pede `Notification.requestPermission()` só a partir do clique
no toggle (nunca automático), subscreve via `pushManager.subscribe` e
grava por `upsert(..., { onConflict: 'endpoint' })` — escrita directa,
fora do outbox, como previsto. `types.ts` do Supabase foi regenerado
(`supabase gen types typescript`) para incluir `push_subscriptions` — só
essa tabela foi acrescentada, confirmado por diff, nada removido.
`tsc -p tsconfig.app.json` limpo (só os 4 erros pré-existentes documentados
em A.1).

**Fazer**: expor `isPushSupported()`, `getPushPermissionState()`,
`subscribeToPush()`, `unsubscribeFromPush()`.
- `subscribeToPush()`: pede `Notification.requestPermission()` (só a partir
  de um clique explícito do utilizador — nunca automático no arranque, para
  não estragar a taxa de aceitação nem violar a política dos browsers),
  depois `registration.pushManager.subscribe({ userVisibleOnly: true,
  applicationServerKey: urlBase64ToUint8Array(VITE_VAPID_PUBLIC_KEY) })`, e
  grava o resultado (`endpoint`, `keys.p256dh`, `keys.auth`) via `upsert` em
  `push_subscriptions` (escrita directa ao Supabase — **não** passa pelo
  `outbox`/fila de sync, porque só faz sentido registar um dispositivo que
  está online neste preciso momento).
- `unsubscribeFromPush()`: `subscription.unsubscribe()` + `delete` da linha
  correspondente por `endpoint`.
**Feito quando**: chamar `subscribeToPush()` num browser Chrome/Edge desktop
grava uma linha real em `push_subscriptions`, visível no dashboard do
Supabase.

### A.5 UI — opt-in por dispositivo

**✅ Implementada (2026-08-26), com mudança de local face ao rascunho
original**. `SettingsPage.tsx` foi descartado como local: `/settings` é
rota **admin-only** por `ROUTE_PERMISSIONS` (`AuthContext.tsx:384`),
decisão intencional documentada em B.6 e que não deveria ser alterada sem
pedido explícito — pôr o toggle lá teria escondido a funcionalidade de
garçom/caixa/cozinha, contrariando directamente o objectivo desta secção
("qualquer papel"). Em vez disso, novo `src/components/
PushNotificationsDialog.tsx`, seguindo exactamente o padrão já existente
de `FeedbackDialog.tsx` (dialog acessível a qualquer papel autenticado a
partir de um botão na `AppSidebar` — footer desktop + menu "Mais" mobile).
Mostra o switch de activar/desactivar, o estado (`Notification.permission`)
e, quando `denied`, a nota de que precisa de ser reactivado nas definições
do browser; detecta iOS fora de PWA instalada (A.9) e mostra mensagem
dedicada em vez de um toggle que não funcionaria. Decisão confirmada com o
utilizador antes de implementar.

**Testado manualmente pelo utilizador** no `vite preview` (build de
produção, SW `injectManifest` activo, conta de teste
`test-push-a-*@example.com`): activou o toggle, o browser pediu a
permissão nativa de notificações, aceitou — subscrição criada com sucesso.
(A automação de browser da sessão ficou bloqueada/sem resposta —
`screenshot`/`read_console_messages`/`read_network_requests` todos a
falhar mesmo em `example.com` — precisamente enquanto esse prompt nativo
estava por responder; consistente com um dialog nativo a suspender o CDP,
o mesmo mecanismo documentado para `alert`/`confirm` do JS.)

**Onde (rascunho original, substituído)**: `src/pages/SettingsPage.tsx` (secção nova "Notificações"),
disponível para qualquer papel (é uma preferência pessoal do dispositivo,
não uma configuração do restaurante — não deve ficar atrás de
`settings.edit`, que hoje é admin-only).
**Fazer**: toggle "Ativar notificações neste dispositivo" que chama
`subscribeToPush()`/`unsubscribeFromPush()`; mostrar estado actual
(`Notification.permission`: `default`/`granted`/`denied`) e, se `denied`,
uma nota explicando que precisa de ser reativado nas definições do browser
(não há como voltar a pedir programaticamente depois de recusado).
**Feito quando**: qualquer funcionário autenticado consegue ligar/desligar
push no seu próprio dispositivo a partir desta página.

### A.6 Servidor — Edge Function `send-push`

**✅ Implementada e testada em produção (2026-08-26)**. Autenticação com
dois modos: chamador de confiança (`Authorization: Bearer
<SUPABASE_SERVICE_ROLE_KEY>`, para A.7 e outras funções — `staffIds`
usado tal como recebido) ou utilizador normal (JWT real; `tenantId` tem de
corresponder a um tenant do chamador, `staffIds` é sempre filtrado para
membros desse tenant, nunca aceita a lista tal como veio do cliente).
Requer também `VAPID_PUBLIC_KEY` como secret (além da privada já definida
em A.2) — `webpush.setVapidDetails` precisa das duas chaves em runtime, e
uma função de servidor não tem acesso a `VITE_VAPID_PUBLIC_KEY` (só existe
no build do cliente).

**Testado com 3 chamadas reais** (`curl`, conta de teste
`test-push-a-1787732048@example.com`, autenticada via password grant):
1. Envio real com `tenantId`/`staffIds` do próprio → `{"total":1,"sent":1,
   "removed":0}`, `webpush.sendNotification` chegou ao FCM e o utilizador
   confirmou ter recebido a notificação no sistema operativo (entrega
   ponta-a-ponta real, não só resposta 200 da função).
2. Tentativa de enviar para o `tenantId` de outra conta de teste → `403
   Sem acesso a este restaurante`.
3. `staffIds` com um id de fora do tenant misturado com o próprio → o id
   estranho foi filtrado silenciosamente, só contou o legítimo
   (`total:1`).

`npm:web-push@3` funciona correctamente via Deno/Edge Functions (nenhuma
incompatibilidade de runtime encontrada).

**Onde**: `supabase/functions/send-push/index.ts` (novo), seguindo o
padrão de `subscription-status` (Deno, `npm:@supabase/supabase-js@2`,
`npm:zod@3` para validar o corpo do pedido, `corsHeaders`).
**Fazer**: usar `npm:web-push@3` (compatível com Deno via `npm:` specifier,
igual ao resto das funções deste projecto). Recebe `{ tenantId, staffIds:
string[], title, body, url, tag? }`, busca as subscrições desses
`staffIds` em `push_subscriptions` com o client de **service role**
(ignora RLS de propósito — é o único sítio que pode ler `endpoint`/chaves
de qualquer funcionário), envia via `webpush.sendNotification(...)` a cada
uma, e **remove do banco** qualquer subscrição que devolva 404/410 (endpoint
expirado — comportamento padrão do protocolo Web Push, evita acumular lixo).
- Esta função **não deve ser chamável livremente pelo cliente** com
  `staffIds` arbitrários — só deve ser invocada a partir de outras Edge
  Functions/triggers de confiança (service role), nunca directamente do
  browser de um funcionário comum. Se precisar de um caminho client-facing
  (ex.: admin a testar "enviar notificação de teste"), validar
  `tenantId` contra o `tenant_id` do chamador autenticado e restringir
  `staffIds` aos membros desse tenant.
**Feito quando**: uma chamada manual à função (via `supabase functions
invoke` ou curl) entrega mesmo uma notificação a um browser com uma
subscrição activa.

### A.7 Gatilhos de eventos → quem recebe

**✅ Implementada e testada em produção (2026-08-26)** — os 2 gatilhos de
maior valor imediato (novo pedido / pedido pronto), como previsto no
"Feito quando" original. Os restantes (estoque, comprovativo pendente,
licença a expirar) ficam para fase 2, tal como já estava documentado.

**`staff_with_permission(_tenant_id, _permission)`** (nova função SQL,
migration `20260826110000_push_event_triggers.sql`) espelha
`DEFAULT_PERMISSIONS` de `src/lib/permissions.ts` + overrides de
`staff_permissions`, com bypass admin/superadmin — duplicação por design
(ver nota no próprio ficheiro da migration: se `DEFAULT_PERMISSIONS`
mudar no cliente, esta função tem de ser actualizada à mão). `revoke
execute ... from public, anon, authenticated` — só chamável a partir de
outra função `security definer` (os triggers abaixo), nunca directamente
por um cliente.

`notify_push_new_order` (`AFTER INSERT ON orders`) e
`notify_push_order_ready` (`AFTER UPDATE ON orders`, só na transição para
`ready`) chamam `send-push` via `net.http_post` (assíncrono —
`fire-and-forget`, uma falha aqui nunca bloqueia/reverte a criação ou
actualização do pedido). Autenticação por `x-push-trigger-secret` ==
`PUSH_TRIGGER_SECRET`, mesmo padrão de `x-cron-secret`/`CRON_SECRET` já
usado por `archive-old-years` — exigiu estender `send-push` (A.6) com este
terceiro modo de confiança e `verify_jwt = false` em `config.toml` (sem
isto a gateway rejeitava o pedido do trigger antes mesmo de correr o
código, por não ter JWT nenhum). Valor gerado uma vez, guardado como
secret da função (`supabase secrets set`) e no Vault (`vault.create_secret`,
passo manual pelo utilizador no SQL Editor — nunca no código nem no
histórico do git, mesmo processo já documentado para `archive_cron_secret`).

**Bug real encontrado e corrigido durante o teste**: as duas funções
usavam a mesma `tag` (`'order-' || id`) para o mesmo pedido — a Web Push
API trata duas notificações com a mesma tag como uma *actualização*
silenciosa da anterior, não um alerta novo. Resultado no primeiro teste:
"Novo pedido" chegou, "Pedido pronto" do mesmo pedido não gerou alerta
novo, apesar de `net._http_response` confirmar `{"sent":1}` nos dois — o
envio funcionou, só a apresentação no dispositivo colidiu. Corrigido em
`20260826120000_fix_push_notification_tags.sql` (`order-new-<id>` vs
`order-ready-<id>`); reteste confirmou as duas notificações a chegarem
separadas.

**Testado com pedidos reais** (conta `test-push-a`, tenant de teste): pedido
"Para levar" → notificação "Novo pedido" recebida; marcado como `ready` →
"Pedido pronto" recebida (só depois da correcção da tag); pedido "Mesa 7"
→ repetição completa do ciclo confirmou as duas notificações separadas.
Dados de teste (as 2 encomendas) apagados a seguir.

Cada gatilho define a audiência **pela permissão relevante**, não pelo
papel em bruto — reaproveita directamente a Parte B, e já respeita
overrides por funcionário (`staff_permissions`) automaticamente:

| Evento | Onde disparar | Audiência (via permissão) |
|---|---|---|
| Novo pedido criado (mesa/QR) | `useRestaurant.ts` (criação de pedido) | `kitchen.view` |
| Pedido pronto (`ready`) | `useRestaurant.ts` (mudança de status) | `tables.view` (garçom/caixa) |
| Estoque abaixo do mínimo | job/trigger sobre `inventory_items` | `inventory.edit` |
| Novo comprovativo de pagamento pendente | já existe evento equivalente in-app (T3.2) | superadmin |
| Licença a expirar em ≤ 7 dias | reaproveita a lógica de `showExpiryWarning` (`DashboardPage.tsx:14`) | admin |

**Fazer**: cada gatilho resolve a lista de `staffIds` do tenant com a
permissão necessária (nova função server-side, ex. RPC
`staff_with_permission(tenant_id, permission)` que espelha
`DEFAULT_PERMISSIONS` + overrides de `staff_permissions` — mesma lógica que
`hasPermission()` no cliente, mas em SQL) e chama `send-push` (A.6) com
esse conjunto.
**Feito quando**: os 2 primeiros gatilhos (novo pedido / pedido pronto —
são os de maior valor imediato) estão ligados; os restantes ficam
documentados aqui para uma fase 2.

### A.8 Deep-link ao clicar na notificação

**Onde**: `src/sw.ts` (A.1).
**Fazer**:
```ts
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? '/';
  event.waitUntil(self.clients.openWindow(url));
});
```
`send-push` inclui `data: { url }` em cada notificação (ex.: `/kitchen` para
"novo pedido", `/pos` para "pedido pronto").
**Feito quando**: clicar numa notificação recebida com a app fechada abre o
browser directamente na página certa.

### A.9 Limitações conhecidas (documentar, não tentar contornar)

- **iOS Safari só suporta Web Push dentro de uma PWA instalada na tela de
  início** (iOS 16.4+) — nunca no Safari normal. Isto é uma limitação da
  plataforma, não do código; a UI de opt-in (A.5) deve detectar e mostrar
  uma mensagem clara em vez de um botão que silenciosamente não faz nada.
- Chrome/Edge/Firefox desktop e Android funcionam sem essa restrição.
- **Só é possível confirmar isto de facto com um dispositivo real** (motivo
  original do adiamento deste item em T4.3) — ambiente de desenvolvimento
  actual não tem forma de validar a entrega ponta-a-ponta.

### A.10 Feito quando (critério geral da Parte A)

Um dispositivo com a app instalada como PWA, **fechada**, recebe uma
notificação real de "pedido pronto" dentro de poucos segundos do evento no
POS, e tocar nela abre a app na página certa.

---

## Parte B — Permissões em falta para atribuir a funcionários

**✅ Implementada (2026-08-26)** — B.1 a B.5 todos feitos, decisão B.2
tomada pela opção 2 (`pos.refund` fica reservado, `orders.cancel` é
permissão nova e separada). `hasRole(...)`/comparação directa de
`user?.role` foi substituído por `hasPermission(...)` nos 4 sítios
identificados (`POSPage.tsx`, `TablesPage.tsx`, `KitchenPage.tsx`,
`CustomersPage.tsx`), com os defaults por papel a replicar exactamente o
comportamento anterior (nenhum acesso mudou no dia da migração — só passou
a ser override-ável por funcionário). `kitchen.serve` foi de facto criado
(a opção B.4 marcada como "opcional" na spec original). 6 ficheiros de
teste que mockavam `useAuth()` sem `hasPermission` (`ui-integration.test.tsx`,
`ui-integration-2.test.tsx`, `a11y.test.tsx` x2, `kitchenPageTvToggle.test.tsx`)
tiveram de ganhar esse mock — sem isso `hasPermission(...)` rebentava com
`TypeError: hasPermission is not a function` ao renderizar. Suite completa
verificada: 222/222 testes, 38/38 ficheiros, sem regressões.

**Parte A (push) — ✅ A.1 a A.7 implementados e testados em produção com
dados reais (2026-08-26)**, incluindo entrega real de notificações
confirmada pelo utilizador em todos os passos. Só falta A.9/A.10 (validação
final num dispositivo real, nomeadamente o caso iOS/PWA instalada — não é
possível confirmar isso neste ambiente de desenvolvimento, mesmo motivo já
registado quando T4.3 foi adiado a primeira vez). Nada desta sessão foi
ainda commitado — B e A continuam só no working tree / já aplicados
directamente em produção (migrations, secrets, edge function).

### B.0 Como o sistema funciona hoje

`src/lib/permissions.ts` define `Permission` (union type), `ALL_PERMISSIONS`,
`PERMISSION_LABELS` (PT), `DEFAULT_PERMISSIONS` por `UserRole`, e overrides
por funcionário na tabela `staff_permissions`. `hasPermission(user, perm)`
devolve sempre `true` para `admin`/`superadmin` (bypass total — nunca ficam
bloqueados pelas próprias permissões). O resto dos papéis (`manager`,
`cashier`, `waiter`, `kitchen`) é resolvido por `getStaffPermissions`, que
lê o override de `staff_permissions` se existir, senão cai no default do
papel.

Levantamento feito por grep a `hasPermission(` e `hasRole(` em todo
`src/pages` — encontradas **5 lacunas reais**, duas delas em acções
sensíveis do POS.

### B.1 `orders.cancel` (nova) — cancelar pedido não tem gate nenhum

**Onde**: `src/pages/POSPage.tsx:466-474`, botão "Cancelar Pedido"
(`cancelOrder(selectedOrderId!)`).
**Porquê é uma lacuna**: qualquer papel com acesso a `/pos` (admin, manager,
cashier, **waiter incluído**) consegue cancelar qualquer pedido — mesmo com
itens já servidos — sem nenhuma verificação de permissão. Comparar com
`pos.discount` (A `hasPermission('pos.discount')` já protege descontos na
mesma página) — cancelar um pedido tem impacto financeiro pelo menos igual,
e hoje está mais aberto que um simples desconto.
**Fazer**: `const canCancel = hasPermission('orders.cancel');` e esconder
(ou desabilitar com tooltip) o botão quando `false`.
**Default sugerido**: `admin`, `manager`, `cashier` sim; `waiter` não
(alinhado com `pos.discount`, que já segue esta mesma divisão).
**Feito quando**: um garçom sem esta permissão deixa de ver o botão
"Cancelar Pedido" no POS.

### B.2 `pos.refund` já existe mas está morto — decisão a tomar

**Onde**: `src/lib/permissions.ts:8,21,39` — está no `Permission` type, em
`ALL_PERMISSIONS` e tem label (`'Reembolsos'`), portanto **já aparece hoje
no checklist de permissões da página Funcionários** (`StaffPage.tsx`, via
`ALL_PERMISSIONS.map(...)`). Confirmado por grep: **zero** chamadas a
`hasPermission('pos.refund')` em todo o `src/` — não protege nenhuma
funcionalidade real porque não existe (ainda) nenhum fluxo de reembolso
distinto de "cancelar pedido".
**Duas opções, escolher uma antes de implementar B.1**:
1. **Reaproveitar `pos.refund` para o cancelamento (B.1)** — evita criar
   permissão nova, e qualquer `staff_permissions` já gravado com
   `pos.refund` (improvável ainda existir em produção, mas verificar) já
   fica correcto sem migração de dados.
2. **Manter `pos.refund` reservado para um fluxo de reembolso futuro**
   (dinheiro devolvido depois do pedido já fechado/pago — diferente de
   cancelar um pedido em aberto) e criar `orders.cancel` como permissão
   separada.
**Recomendação**: opção 2 — são acções com timing e risco diferentes
(cancelar um pedido aberto vs. reembolsar um já pago), e um restaurante
pode querer, por exemplo, deixar o caixa cancelar mas só o gerente
reembolsar. Mas registar aqui a decisão porque a opção 1 é válida e mais
barata se o produto não distinguir os dois casos por agora.
**Feito quando**: a decisão está tomada e documentada (actualizar este
ficheiro com a escolha final), e `pos.refund` deixa de estar
"pendurado" sem nenhum código a lê-lo.

### B.3 `tables.manage` (nova) — gestão de mesas hardcoded por papel

**Onde**: `src/pages/TablesPage.tsx:38-39`:
```ts
const canManage = hasRole(['admin', 'manager']);
const canConfirm = hasRole(['admin', 'manager', 'cashier']);
```
**Porquê é uma lacuna**: ao contrário de quase todas as outras páginas
(Menu, Inventário, Relatórios, Clientes, Turnos — todas usam
`hasPermission(...)`), Mesas usa `hasRole(...)` directamente. Um admin não
consegue delegar a um `cashier` ou `waiter` específico a gestão de mesas
(criar/editar/apagar mesa) sem lhe atribuir o papel inteiro de `manager` —
quebra o modelo "permissão fina por funcionário" que o resto da app já
oferece.
**Fazer**: adicionar `'tables.manage'` a `Permission`/`ALL_PERMISSIONS`/
`PERMISSION_LABELS` (ex.: `'Gerir mesas'`), incluir em `DEFAULT_PERMISSIONS`
para `admin`/`manager` (replicando o `canManage` actual) e trocar
`hasRole(['admin','manager'])` por `hasPermission('tables.manage')` em
`TablesPage.tsx`. `canConfirm` pode continuar a usar `tables.view` (já
existe e já é o que o resto do RequireAuth usa para esta rota) ou ganhar a
sua própria permissão fina se fizer sentido separar "confirmar pedido QR"
de "editar mesa".
**Feito quando**: `tables.manage` aparece na lista de permissões da página
Funcionários e controla de facto o botão de editar/apagar mesa.

### B.4 `kitchen.manage` (nova) — progressão de pedidos na cozinha hardcoded

**Onde**: `src/pages/KitchenPage.tsx:50-51`:
```ts
const canManageKitchen = user?.role === 'admin' || user?.role === 'manager' || user?.role === 'kitchen';
const canServe = user?.role === 'admin' || user?.role === 'manager' || user?.role === 'waiter' || user?.role === 'cashier';
```
**Porquê é uma lacuna**: mesmo padrão do B.3 — comparação directa de
`user?.role` em vez de `hasPermission`, sem possibilidade de override por
funcionário. `kitchen.view` já existe e já controla o **acesso** à página
(`RequireAuth`/`ROUTE_VIEW_PERMISSION`), mas não distingue "ver a cozinha"
de "avançar o estado dos pratos" — hoje isso é só por papel.
**Fazer**: adicionar `'kitchen.manage'` (avançar estado dos itens) e
reaproveitar `tables.view` ou criar `'kitchen.serve'` para `canServe` (a
acção de "marcar como servido" é conceptualmente mais próxima de sala do
que de cozinha). Definir em `DEFAULT_PERMISSIONS` replicando exactamente a
matriz de papéis actual, para não mudar comportamento no dia da migração —
só passa a ser **override-ável** por funcionário depois.
**Feito quando**: `KitchenPage.tsx` usa `hasPermission(...)` em vez de
comparações directas de `user?.role`, sem mudar quem tem acesso a quê por
omissão.

### B.5 Aba "Configurações" em Clientes usa `isManager`, não uma permissão

**Onde**: `src/pages/CustomersPage.tsx:74,243,292`:
```ts
const isManager = user?.role === 'manager' || user?.role === 'admin';
```
controla a visibilidade da aba "Configurações" (definições do programa de
fidelidade).
**Porquê é uma lacuna**: mesmo padrão B.3/B.4. Já existe `settings.edit`
no sistema de permissões, mas é hoje só usado (implicitamente) para
`/settings`, que é rota admin-only por desenho (`ROUTE_PERMISSIONS` em
`AuthContext.tsx:384`) — não é reaproveitável aqui sem abrir mais do que
deveria. Mais correcto: uma permissão nova e específica.
**Fazer**: adicionar `'loyalty.manage'` (ex. label `'Gerir fidelidade'`),
default `admin`+`manager` (replica `isManager` actual), trocar o check em
`CustomersPage.tsx`.
**Feito quando**: `isManager` deixa de existir em `CustomersPage.tsx`,
substituído por `hasPermission('loyalty.manage')`.

### B.6 Não são lacunas — confirmar e não mexer

Para não se perder tempo "corrigindo" coisas que já estão certas por
desenho:
- `/settings`, `/expenses`, `/data-archive`, `/billing`, `/pricing`,
  `/onboarding` — exclusivos de `admin` por `ROUTE_PERMISSIONS`
  (`AuthContext.tsx:384-396`), com comentário explícito no código a dizer
  que é intencional (dados sensíveis: salários, despesas, apagar dados
  definitivamente, faturação). **Não** transformar em permissões
  delegáveis sem pedido explícito — seria mudar uma decisão de produto já
  tomada e documentada.
- `StaffPage.tsx:68` (`canManagePerms = user?.role === 'admin' ||
  'superadmin'`) — quem pode **atribuir permissões a outros** fica
  deliberadamente fora do próprio sistema de permissões (não dá para um
  funcionário conceder poderes a si mesmo via override). Correcto como
  está.

### B.7 Resumo — permissões novas propostas

| Permissão | Label PT | Default sugerido | Substitui |
|---|---|---|---|
| `orders.cancel` (ou reaproveita `pos.refund`, ver B.2) | Cancelar pedidos | admin, manager, cashier | nada (gate inexistente) |
| `tables.manage` | Gerir mesas | admin, manager | `hasRole(['admin','manager'])` em TablesPage |
| `kitchen.manage` | Gerir cozinha | admin, manager, kitchen | `user?.role === ...` em KitchenPage |
| `kitchen.serve` (opcional, ver B.4) | Marcar como servido | admin, manager, waiter, cashier | idem |
| `loyalty.manage` | Gerir fidelidade | admin, manager | `isManager` em CustomersPage |

Cada uma segue o mesmo padrão de adição: `Permission` type → `ALL_PERMISSIONS`
→ `PERMISSION_LABELS` → `DEFAULT_PERMISSIONS` (todos em
`src/lib/permissions.ts`), depois trocar o `hasRole`/comparação directa
pela chamada a `hasPermission` na página correspondente. Nenhuma migration
é necessária para isto — `staff_permissions.permissions` já é `text[]`
livre, aceita qualquer string nova sem alterar schema.

---

## Ordem sugerida

1. **B primeiro, é barato e não depende de nada** (sem migration, só
   código — mesmo padrão T1/T2 do resto do backlog). Resolver B.2 (decisão
   `pos.refund` vs `orders.cancel`) antes de B.1.
2. **A.7 depende directamente de B** (`kitchen.view`, `tables.view`,
   `inventory.edit` já existem; usar as mesmas permissões — não esperar
   pelas novas de B.1/B.3/B.4 para o primeiro corte de push, que só precisa
   das permissões de **ver**, já existentes).
3. **A.1–A.6 é o grosso do esforço novo** (infraestrutura: migration,
   secrets, edge function, mudança de estratégia do Service Worker) —
   pode avançar em paralelo com B, só junta no A.7.
4. Validação final de A precisa de dispositivo real (A.9) — não é
   bloqueável neste ambiente, tal como já registado quando T4.3 foi
   adiado a primeira vez.
