# Spec: Confirmação automática de pagamentos (activação de plano sem intervenção manual)

Hoje, activar a subscrição de um restaurante depois de um pagamento manual
(M-Pesa/e-Mola/transferência) é um processo **100% humano**: o cliente
combina o plano por WhatsApp, paga, o superadmin (Carlos) recebe uma SMS
de confirmação no telemóvel, e activa o plano à mão no painel Super Admin.

Esta versão da spec substitui o desenho anterior (que dependia do cliente
copiar à mão o ID de transacção da operadora) pelo fluxo que Carlos
propôs, já ajustado a uma restrição real confirmada por ele: **só a
própria app do e-Mola consegue gerar um QR de pagamento válido** — não é
possível gerar isso dinamicamente a partir do site. Isto significa que os
QR são **pré-gerados por Carlos, um por plano** (não um por tentativa de
pagamento), e reutilizados por todos os clientes desse plano. O resto do
fluxo (SMS lida automaticamente, correspondência à sessão certa, código
enviado ao cliente por email/SMS) mantém-se, só a forma de corresponder é
que muda — ver Secção 2.

**Estado**: especificação, com as decisões D1-D3, D5, D7, D8 já tomadas
(Secção 6) — falta desenhar/implementar o código. D4 e D6 continuam em
aberto (D6 deixou de se aplicar, ver nota na própria secção).

---

## 0. O que já existe hoje (fluxo manual actual)

1. **Pedido de activação por WhatsApp** (`buildPlanWhatsAppLink` em
   `src/lib/billing.ts:95-107`, usado em `src/pages/PricingPage.tsx`): o
   cliente clica "Começar", abre WhatsApp com mensagem pré-escrita a dizer
   qual plano/preço quer, para qual restaurante.
2. **Pagamento**: para o número M-Pesa/e-Mola central do superadmin
   (`system_payment_accounts`, singleton `id=1` — um único número para
   toda a plataforma). As duas imagens de QR fornecidas como exemplo
   (`Carlos Jose Correia`, `866453202`, valor, nome do plano) são geradas
   **manualmente por Carlos dentro da app do e-Mola**, não por este
   projecto — é exactamente este passo manual que o novo fluxo elimina.
3. **Confirmação por SMS**, formato real observado:
   > `ID Trans: PP260821.2115.C86954. Recebeu 40.00MT de 878241021, sandra
   > maria menzissane hibrantes as 21:15:58 21/08/2026. Conteudo:
   > Profissional. O seu novo saldo e de 47.00MT.`

   Campos extraíveis: ID de transacção, valor, telefone/nome do pagador,
   **conteúdo** (texto livre que o pagador — ou, no fluxo actual, o botão
   de pagar do e-Mola — preencheu ao enviar), novo saldo.
4. **Submissão manual pelo cliente** (`src/pages/BlockedPage.tsx:119-131`,
   `submitPayment` em `src/lib/paymentSubmissions.ts:52-62`): campo
   "Referência" em `/blocked`, hoje pedindo ao cliente para copiar à mão o
   ID de transacção da sua própria SMS. **Este passo deixa de ser
   necessário no novo fluxo** — ver Secção 2.
5. **Activação manual** (`src/pages/SuperAdminPage.tsx:39,194,203`):
   Carlos escolhe o plano à mão (`activatePlan: BillingPlan`) e chama
   `tenantStore.activatePlan` → Edge Function `subscription-status`,
   `action: 'activate'` (ver `supabase/functions/subscription-status/
   index.ts:154-172`).

Preços reais (`src/lib/billing.ts:33-41`): 8 valores, todos distintos,
entre 2200 e 30000 MT — os valores nas imagens de exemplo (20MT/40MT) são
de teste, não batem com nenhum preço real.

---

## 1. Objectivo

Eliminar os passos manuais 4 (cliente copiar ID de transacção) e 5
(Carlos escolher o plano e activar à mão) do fluxo actual (Secção 0),
substituindo-os por:

1. Carlos gera, **uma vez por plano** (não por cliente), um QR na app do
   e-Mola com o valor certo e um **código de plano** fixo como conteúdo
   (ver Secção 2). São **12 QR** no total — os 8 planos a preço cheio
   mais 4 variantes com desconto (só Profissional, ver Secção 2.1) —
   guardados na app para reutilização; este passo continua manual, mas
   só acontece quando os preços mudam, não a cada venda.
2. Ao escolher um plano, o cliente vê o QR correspondente (e, no mesmo
   dispositivo, os dados em texto para introduzir à mão — ver Secção 3.2)
   e paga.
3. A SMS chega a Carlos, é lida automaticamente (screenshot →
   extracção), e corresponde-se — com o máximo de confiança possível
   dado que o conteúdo já não é único por cliente — à sessão de checkout
   pendente certa (Secção 4).
4. O plano é activado automaticamente para o tenant certo.
5. **Só depois disto**, a app gera um **código de acesso** novo e
   envia-o ao cliente por email ou SMS (o contacto capturado quando
   escolheu o plano). O cliente introduz esse código na app e é levado
   para dentro do sistema com a conta já actualizada — tanto no primeiro
   registo como numa renovação antes de expirar.

---

## 2. O mecanismo central: sessão de checkout + dois códigos distintos

O desenho anterior desta spec assumia um `match_token` único gerado por
cada tentativa de pagamento, embutido dinamicamente no QR — **isso não é
possível**, porque o QR não é gerado pela app, é pré-gerado por Carlos na
app do e-Mola, um por plano, reutilizado por todos os clientes desse
plano. Ajustado:

- **`plan_code`** — fixo por plano (ex. `PRO-MENSAL`, `PRO-TRIMESTRAL`,
  `BASICO-ANUAL`, ...), definido uma vez quando Carlos cria cada QR na
  app do e-Mola (usa isto como "Conteudo" em vez do nome do plano em
  português, para ser inequívoco e fácil de reconhecer no texto da SMS).
  **Não é único por cliente** — identifica o plano, não a sessão.
- **`access_code`** — gerado **só depois** de o pagamento estar
  confirmado (Secção 4), único por sessão de checkout, e enviado ao
  cliente por email (D7). É este que o cliente introduz na app para
  confirmar a renovação já activada (Secção 5).

Fluxo completo (sempre a renovar/actualizar antes de expirar, já
autenticado — D8; o registo grátis de 7 dias mantém-se inalterado e não
passa por este fluxo):

1. Cliente, já autenticado, escolhe um plano a partir do ecrã de planos
   (email de contacto já conhecido — `profiles.email`, não precisa de o
   pedir de novo).
2. A app cria uma linha nova em `checkout_sessions`: `id`, `tenant_id`
   (sempre conhecido — é o tenant autenticado), `plan`, `amount` (preço
   exacto, com desconto multi-restaurante se elegível), `contact_email`,
   `access_code` (ainda `null`), `status: 'pending'`, `created_at`,
   `expires_at` (ver D3).
3. A app mostra o QR **fixo desse plano** (pré-gerado por Carlos — Secção
   1) mais os dados em texto (Secção 3.2).
4. Cliente paga. A SMS que chega a Carlos traz o `plan_code` no campo
   "Conteudo" — identifica o plano, mas **não** identifica sozinha qual
   das (potencialmente várias) sessões pendentes desse mesmo plano é
   esta. A correspondência final usa `plan_code` + `amount` +
   "só uma sessão pendente por resolver para este plano" — ver Secção
   4.3 para a lógica completa e o que acontece quando há mais do que uma
   candidata.
5. Depois de validado, a sessão passa a `status: 'paid'`, o plano é
   activado para o `tenant_id` correspondente, **e só agora** é gerado o
   `access_code` e enviado ao contacto guardado no passo 1.
6. Cliente introduz o `access_code` onde a app pedir (Secção 5) — a app
   procura a sessão por `access_code`, confirma `status = 'paid'`, e
   segue com a conta já activada.

Isto substitui inteiramente a necessidade do campo "Referência" actual em
`/blocked` — o cliente nunca mais copia nada da própria SMS à mão.

### 2.1 Duas lacunas reais que o QR fixo por plano introduz

**Desconto multi-restaurante (20%) não é compatível com um QR fixo, mas
tem solução: gerar QR extra por variante de preço.** ✅ Resolvido —
decidido gerar **12 QR no total**, não 8: os 8 preço-cheio (todos os
planos) mais 4 com desconto (só os planos Profissional — o desconto foi
**restringido ao Profissional**, decisão tomada e já implementada em
`PricingPage.tsx`/`BillingPage.tsx`/`RestaurantSwitcherDialog.tsx`: o
Básico deixou de aceitar desconto, mesmo para clientes elegíveis).

Cada `plan_code` (Secção 2) passa a existir em duas variantes para os 4
planos Profissional (ex. `PRO-MENSAL` e `PRO-MENSAL-DESC`), com valores
distintos gravados em cada QR correspondente. A app já sabe hoje se um
cliente é elegível (`hasProfessionalSibling`, usado em `PricingPage.tsx`)
— mostra o QR certo (com ou sem `-DESC`) consoante essa elegibilidade, em
vez de decidir manualmente. **Não precisa de nenhuma lógica de
correspondência nova**: a Secção 4.3 já resolve por `plan` (agora só
precisa de saber que `PRO-MENSAL-DESC` mapeia para o mesmo `BillingPlan`
`monthly`, só com `amount` diferente) + `amount` + sessão única pendente
— o mecanismo generaliza directamente de 8 para 12 `plan_code`
distintos, sem mudar o desenho.

**QR fica desactualizado se o preço do plano mudar.** `billing_plans.price`
é editável (ver `SuperAdminPage`) — se Carlos mudar o preço de um plano
ali, o QR que já tinha pré-gerado na app do e-Mola continua com o valor
antigo até ele o regenerar manualmente lá também. Não há forma de a app
"avisar" a app do e-Mola disto automaticamente. Vale a pena que
`SuperAdminPage` mostre um aviso claro ("lembre-se de actualizar o QR do
e-Mola") sempre que um preço for editado, para isto não ficar esquecido.

---

## 3. Pagar a partir do mesmo telemóvel onde está a app (limitação real)

Carlos levantou uma preocupação válida: **não é fisicamente possível
escanear um QR mostrado no ecrã do mesmo telemóvel que está a fazer o
scan** (a câmara não consegue apontar para o próprio ecrã). Isto já é uma
limitação do fluxo manual actual — quando o "QR" chega por WhatsApp para
o telemóvel do próprio cliente, ele já teria de usar um segundo
dispositivo ou introduzir os dados à mão na app do e-Mola. Não é um
problema novo introduzido por esta automação, mas vale a pena desenhar
para os dois casos deliberadamente:

### 3.1 Cliente a navegar noutro dispositivo (ex. computador)
Mostra o QR normalmente — escaneia com o telemóvel onde tem o e-Mola/
M-Pesa instalado. Caso comum e sem fricção.

### 3.2 Cliente a navegar no mesmo telemóvel onde tem o e-Mola/M-Pesa
Sem QR escaneável possível neste caso. A app deve sempre mostrar, ao
lado/por baixo do QR, os dados em **texto copiável**: número de destino,
valor exacto, e `plan_code` a usar como conteúdo — para o cliente abrir a
app do e-Mola/M-Pesa manualmente e preencher à mão (ou usar
"copiar" + "colar" se a app do operador aceitar). Isto é sempre a base
de referência; o QR é só uma conveniência extra para quem tem um segundo
dispositivo.

**Nota para investigar mais tarde, não bloqueante agora**: alguns
operadores/apps de carteira suportam um link `tel:`/URI próprio que abre
directamente a própria app já com os campos preenchidos (sem precisar de
scan nenhum) — se existir para e-Mola/M-Pesa, resolveria o caso 3.2 sem
fricção nenhuma. Não confirmado; não é uma dependência para o resto do
plano avançar (o texto copiável já resolve o caso, só com mais um passo
manual).

---

## 4. Validação automática do pagamento (SMS → sessão)

**D2 resolvida: Opção B** (app de reencaminhamento de SMS tipo Tasker/
MacroDroid). A SMS chega já como **texto**, directamente por webhook —
não há ingestão de imagem nem extracção por visão (4.1/4.2 da versão
anterior desta secção ficam sem objecto, ver nota abaixo). O destino do
webhook é **directamente uma Edge Function no Supabase**, a correr na
nuvem, sem depender de nenhum PC ligado nem de segredos guardados numa
máquina local — D6 deixa de se aplicar (era só relevante sob a Opção A).

Risco próprio desta opção a não esquecer (já registado em D2/Secção 7):
a app de reencaminhamento tem de ficar **excluída da optimização de
bateria do Android**, senão pode parar de encaminhar silenciosamente ao
fim de algum tempo — vale a pena confirmar isto está persistente no
telemóvel antes de confiar nisto em produção, e considerar um alerta se
nenhuma SMS for recebida durante um período anormalmente longo.

### 4.1 Ingestão (webhook)
A Edge Function nova (ver Autenticação da chamada, abaixo) recebe um
`POST` do webhook da app de reencaminhamento com o texto integral da SMS.

### 4.2 Extracção dos dados
Texto já estruturado (formato fixo e estável, ver exemplo na Secção 0) —
extracção por expressão regular simples, sem custo de API nem risco de
leitura errada de imagem, devolvendo os campos: `planCode` (do campo
"Conteudo"), `amount`, `transactionId`, `payerPhone`, `timestamp`.

### 4.3 Correspondência — por plano + valor + sessão única pendente
Já não há uma chave 100% única (Secção 2) — o desenho tem de aceitar isso
e ser conservador quando há ambiguidade real, em vez de forçar uma
correspondência:

1. Traduzir `planCode` extraído de volta ao `plan` (`BillingPlan`) —
   comparação exacta contra a tabela fixa dos 12 `plan_code` definidos
   (Secção 2/2.1; as variantes `-DESC` mapeiam para o mesmo `plan`, só
   com `amount` esperado diferente).
2. Procurar `checkout_sessions` com `status = 'pending'`, `plan` igual,
   `amount` igual ao extraído (o `plan_code` já diz se é a variante com
   ou sem desconto), e `expires_at` ainda no futuro.
3. **Se houver exactamente uma candidata**: corresponde-se com
   confiança suficiente para activar — plano + valor exacto + ser a
   única pendente nesse plano já é um sinal forte para o volume baixo
   deste negócio.
4. **Se houver zero ou mais do que uma candidata**: **não activar nada**
   — ver Secção 4.5. Isto significa que, sob concorrência real (dois
   clientes a pagar o mesmo plano quase ao mesmo tempo), a automação
   deliberadamente recua para revisão manual em vez de arriscar activar
   o tenant errado. Aceitável à escala actual do negócio; reavaliar se o
   volume crescer (nesse caso, D1/D2 desta versão da spec — QR estático
   por plano — passam a ser o principal limite a resolver, não só um
   detalhe de implementação).

### 4.4 Activação
Marcar `checkout_sessions.status = 'paid'`, `paid_at`, `transaction_id`
(o ID real da operadora, guardado para auditoria mesmo não sendo usado
para corresponder) — sempre, em qualquer caso, e como uma única operação
atómica com a verificação de 4.3 (ver Secção 7, risco de corrida).

**D8 resolvida (adicional ao trial) simplifica esta secção**: `tenant_id`
está sempre conhecido na sessão (é sempre o tenant já autenticado que
está a renovar/actualizar — Secção 2), logo activa-se o plano
imediatamente aqui, reaproveitando `subscription-status`
(`action: 'activate'`), mesma tabela `subscriptions`, mesmo registo em
`subscription_history` (gravando `transactionId` como `ref`). Não há
sub-caso de "primeiro registo sem tenant" a tratar.

**Gerar e entregar o `access_code`**: só depois da activação, gerar um
código novo, curto, gravá-lo em `checkout_sessions.access_code`, e
enviá-lo ao `contact_email` guardado na sessão (Secção 2 passo 1), por
email (D7).

**Nota sobre envio de email**: este projecto já teve um problema real de
envio de email (o `/auth/v1/signup` do Supabase falhava com "Error
sending confirmation email" por falta de SMTP configurado, resolvido
nesta sessão só ao desligar a confirmação por email — não ao configurar
SMTP). Por isso o envio do `access_code` (D7) usa um serviço de email
dedicado (ex. Resend/SendGrid, chamado a partir de uma Edge Function),
não o SMTP do Supabase. Falta confirmar se Carlos já tem conta num destes
serviços antes de implementar.

**Autenticação da chamada**: `subscription-status` hoje só aceita JWT de
utilizador `superadmin` para acções que não sejam `status`. Recomendado
criar uma Edge Function nova e pequena (ex. `auto-activate-payment`),
autenticada por segredo dedicado (mesmo padrão de `x-cron-secret`/
`x-push-trigger-secret` já usados no projecto — ver
`docs/spec-push-notificacoes-permissoes.md`, secção A.6), em vez de dar a
este processo automático as mesmas credenciais que um humano superadmin
usaria interactivamente.

### 4.5 Quando não há correspondência confiante
Nunca activar às cegas. Registar a tentativa (imagem/dados extraídos +
motivo da falha: nenhuma sessão pendente para este plano/valor, mais do
que uma candidata, ou sessão expirada) para revisão manual — ver Decisão
D5.

---

## 5. Onde o cliente introduz o código

Um único ponto de entrada, dado D8 (adicional ao trial — sem caso de
"primeiro registo" a resolver aqui): **renovar/actualizar antes de
expirar** (`PricingPage`/`BillingPage`, já autenticado). Resolve-se
sempre por `access_code` (nunca pelo `plan_code`, que é fixo/partilhado e
nunca serve para identificar uma sessão específica). Ao escolher o
pacote, mostra o QR e, depois de pagar, um campo para introduzir o
`access_code` recebido por email — ao confirmar `paid`, o plano do
tenant já autenticado é actualizado de imediato (a activação em si já
aconteceu no passo 4.4; aqui é sobretudo a confirmação/UI a reflectir
isso para quem está a acompanhar no ecrã).

**Nota**: como a activação real (4.4) já acontece assim que a SMS é
validada — não só quando o cliente introduz o `access_code` — o código
serve principalmente para **o cliente confirmar/entrar**, não para
desencadear a activação em si. Isto significa que mesmo que o cliente
feche a app e só volte horas depois, o plano já está activo; o código só
destranca a entrada dele.

---

## 6. Decisões a tomar

**D1 — ✅ Resolvida.** QR pré-gerado por Carlos na app do e-Mola, um por
plano (Secção 1-2). Falta só ele gerar os 12 (Secção 2.1) usando
o `plan_code` de cada um como conteúdo — as duas imagens de exemplo já
confirmadas como suficientes para testar a extracção (Secção 4.2).

**D2 — ✅ Resolvida: Opção B** (app de reencaminhamento de SMS, ex.
Tasker/MacroDroid). Lê a SMS directamente como texto e envia por webhook
assim que chega — sem screenshot, sem OCR/visão (Secção 4). Condição
para confiar nisto em produção: confirmar que a app fica excluída da
optimização de bateria do Android de forma persistente no telemóvel de
Carlos (senão pode parar de encaminhar silenciosamente); considerar
também um alerta se ficar tempo demais sem nenhuma SMS recebida, como
sinal indirecto de que parou.

**D3 — ✅ Resolvida: 60 minutos.** `expires_at = created_at + 60min`.
Dá folga ao cliente para pagar com calma; aceite o risco correspondente
de uma janela maior onde duas sessões do mesmo plano podem coexistir e
fazer a automação recuar para revisão manual (Secção 4.3) — considerado
aceitável ao volume actual do negócio.

**D4 — O que acontece se o email com o `access_code` não chegar ou o
cliente o perder?** Precisa de uma forma de o reenviar (ex. botão
"reenviar código" que procura a sessão `paid` mais recente por
tenant/contacto) sem gerar um `access_code` novo que invalide o anterior
sem aviso.

**D5 — ✅ Resolvida: registar + notificar Carlos por push**, reaproveitando
o sistema já implementado em `docs/spec-push-notificacoes-permissoes.md`,
além de gravar a tentativa (Secção 4.5) para revisão manual.

**D6 — Não se aplica**, dado D2 = Opção B (a Edge Function corre na nuvem
por natureza, sem processo local nenhum a gerir).

**D7 — ✅ Resolvida: email**, via serviço dedicado (Resend/SendGrid,
chamado a partir de uma Edge Function) — não o SMTP do Supabase, que já
falhou neste projecto (nota na Secção 4.4). SMS fica fora de âmbito por
agora (evita montar uma integração nova de raiz). Falta confirmar se
Carlos já tem conta num destes serviços antes de implementar o envio.
Consequência directa: o "contacto" do passo 1 da Secção 2 passa a ser só
**email** (não telefone) — simplifica o desenho do formulário de
checkout.

**D8 — ✅ Resolvida: adicional ao trial.** O registo grátis de 7 dias
(`SignupPage`/`bootstrap-tenant`) mantém-se inalterado; este fluxo novo
só entra para **renovar/actualizar antes de expirar**, a partir de
`PricingPage`/`BillingPage` já autenticado. Consequência directa em toda
a Secção 4.4/5: `checkout_sessions.tenant_id` **nunca é `null`** — é
sempre conhecido no momento da criação da sessão (passo 2 da Secção 2),
o que elimina o sub-caso "primeiro registo" descrito nessas secções e
simplifica a implementação (activação em 4.4 é sempre o caso "tenant_id
já conhecido"; o ponto de entrada da Secção 5 é sempre o de
"renovar/actualizar", não o de `SignupPage`/`BlockedPage`).

---

## 7. Riscos e porque o desenho os mitiga

- **Correspondência ambígua entre duas sessões do mesmo plano** — o
  risco residual mais real deste desenho, precisamente porque o
  `plan_code` deixou de ser único por cliente (Secção 2). Mitigado por
  nunca activar quando há mais do que uma sessão pendente candidata
  (4.3) — prefere falhar para revisão manual a activar o tenant errado.
- **Cliente engana o sistema** (ex. paga um valor diferente do pedido,
  ou reencaminha uma SMS antiga) — mitigado pela verificação de
  plano+valor (4.3) e pela sessão ter de estar `pending`/não expirada.
- **`access_code` intercetado ou adivinhado** — como só é gerado e
  enviado depois do pagamento já estar confirmado, um `access_code`
  válido não pode ser obtido sem primeiro haver mesmo um pagamento
  correspondido; ainda assim deve ser suficientemente longo/aleatório
  para não ser adivinhável por tentativa-e-erro (e a app deve limitar
  tentativas de introdução, tal como já faz no login — ver
  [[security_review_state]]/rate limiting).
- **Falha silenciosa** — mitigada pelo registo obrigatório de toda a
  tentativa de correspondência, mesmo quando falha (4.5).
- **QR desactualizado face a um preço editado** (Secção 2.1) — não é
  mitigado automaticamente, é um limite conhecido do QR fixo; mitigado
  por processo (avisar Carlos ao editar preços em `SuperAdminPage`) em
  vez de por código. (O caso do desconto já ficou resolvido por completo
  com os 12 QR, não é um risco residual.)
- **Corrida entre dois pagamentos processados quase ao mesmo tempo**
  (ex. dois webhooks quase simultâneos, ou reprocessar a mesma SMS por
  engano) — a verificação "exactamente uma candidata" (4.3) e a
  activação (4.4) têm de ser uma **operação atómica** (ex. um único
  `UPDATE ... WHERE status = 'pending' AND ... RETURNING *`, não um
  `SELECT` seguido de `UPDATE` em dois passos), senão duas chamadas quase
  simultâneas podiam ambas "ver" a mesma sessão `pending` antes de
  qualquer uma a marcar `paid`, e activar a mesma sessão duas vezes (ou
  pior, cada uma achar que corresponde à sua própria SMS). Isto também
  fecha de borla o caso de um cliente tentar ganhar duas activações de um
  só pagamento real, abrindo duas sessões pendentes do mesmo plano — como
  isso já produz "mais do que uma candidata" (4.3, ponto 4), nenhuma das
  duas activa automaticamente.

---

## 8. Ordem sugerida

Todas as decisões de arquitectura (D1-D3, D5, D7, D8) já estão tomadas
(Secção 6) — falta só D4 (reenvio de `access_code`, decisão pequena,
pode ficar para a Secção 5) antes de avançar para código.

1. Carlos gera os 12 QR (Secção 2.1) na app do e-Mola, cada um com o
   `plan_code` certo como conteúdo (Secção 1-2) — trabalho manual único,
   independente do código. O ajuste ao código do desconto
   multi-restaurante (restrito ao Profissional) já está feito.
2. Desenhar e criar `checkout_sessions` (schema) — `tenant_id` sempre
   `NOT NULL` (D8), `contact_email` (não `contact_phone`, D7).
3. Construir a Edge Function nova `auto-activate-payment` (autenticação
   por segredo dedicado, Secção 4.4) com a validação/correspondência
   (Secção 4.3-4.4) e testá-la isoladamente com sessões de teste (sem SMS
   reais ainda).
4. Ligar o webhook real da app de reencaminhamento (D2, Secção 4.1-4.2),
   testado primeiro com uma chamada simulada.
5. Ligar a geração+envio do `access_code` por email (D7, precisa de
   confirmar/configurar o serviço dedicado primeiro) e o ponto de entrada
   do lado do cliente (Secção 5), incluindo o texto copiável para o caso
   "mesmo telemóvel" (Secção 3.2) e a exclusão do caminho QR para
   clientes elegíveis a desconto (Secção 2.1).
6. Ligar a notificação push a Carlos quando não há correspondência
   confiante (D5, Secção 4.5).
