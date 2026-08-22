# Análise do sistema — restaurant_v2

Estado em 2026-08-22. Cobre o sistema inteiro: 26 páginas, ~30 módulos `lib/`,
28 tabelas na base de dados, arquitectura local-first com sync para Supabase.
Ainda sem clientes reais — o foco é "o que falta antes de lançar a sério" e
"o que dá para acrescentar depois".

---

## 1. Visão geral

SaaS multi-tenant para restaurantes moçambicanos (M-Pesa/e-Mola, NUIT, PT-MZ).
Local-first genuíno: toda a UI lê/escreve em `localStorage` primeiro, uma fila
de outbox sincroniza para Supabase em segundo plano com last-write-wins por
`client_updated_at`. Dois planos (Básico/Profissional × 4 durações),
activação manual por WhatsApp — decisão consciente, documentada em memória,
não uma lacuna.

**Pontos fortes que vale reconhecer** (para não parecer que está tudo mal):
isolamento por tenant é levado a sério e testado; a fila de sync sobrevive a
fechar a app e retoma sozinha por 3 gatilhos diferentes; RLS cobre as 28
tabelas de forma consistente; a suite de testes (unit + Cypress) já é
substancial depois desta sessão; o modelo de permissões por papel é coerente
em toda a app.

---

## 2. Lacunas de maior impacto (por prioridade)

### 2.1 Onboarding larga o dono num sistema vazio — o maior risco do lote

O wizard de onboarding (2 passos: criar restaurante + convidar equipa) nunca
sugere configurar cardápio ou mesas. Um restaurante novo termina direto num
Dashboard vazio, sem ninguém o guiar para `/menu` ou `/tables`. É a pior
primeira impressão possível para o primeiro cliente real — antes de divulgar
o produto, isto devia ter pelo menos um 3º passo ou um checklist pós-signup.

### 2.2 Sem recuperação de password

Não há fluxo de "esqueci a password" em lado nenhum (`LoginPage`/`SignupPage`).
Um admin bloqueado fora da própria conta não tem caminho self-service — só
recorrendo directamente à base de dados. Supabase já suporta
`resetPasswordForEmail` nativamente; é uma lacuna barata de fechar e cara de
sofrer depois de haver clientes reais.

### 2.3 Comprovativos de pagamento e feedback não notificam ninguém

`paymentSubmissions.ts`/`feedback.ts` são pull-only — só aparecem se alguém
abrir o SuperAdminPage manualmente. Isto já é um ponto cego enquanto é só o
utilizador a testar; à medida que houver clientes reais à espera de activação,
um comprovativo pode ficar horas sem resposta sem ninguém saber que chegou.

### 2.4 Fila de sync (outbox) sem limite nem purga

Sem cap de tamanho — um dispositivo esquecido offline dias/semanas (realista
no mercado-alvo) acumula operações sem controlo até `localStorage` rebentar,
e rebenta **em silêncio** (`catch { /* quota */ }`, a escrita mais recente
simplesmente não persiste). Falhas permanentes exigem acção manual no
`SyncStatus` — sem push/banner proactivo. E "Limpar fila" descarta dados sem
deixar nenhum registo do que foi perdido, num contexto onde o utilizador
frustrado vai clicar nesse botão mais cedo do que seria prudente.

### 2.5 Vestígios do Stripe espalhados por 4 sítios

`SettingsPage` (aba "Faturação SaaS"), `billing.ts` (`stripe_link_*`),
`BillingSuccessPage.tsx` (código morto, só alcançável por um link antigo
esquecido), e antes também `PricingPage`. Resíduo de uma migração para
pagamento manual por WhatsApp que nunca foi limpo. Decisão a tomar: remover
de vez, ou formalizar como plano futuro (pagamento automático internacional).

### 2.6 `totalPaid` da subscrição recalcula com preços actuais, não históricos

Em `BillingPage`, o total pago é derivado de `PLANS` (preços de hoje), não do
preço realmente pago em cada renovação. Se algum dia o superadmin editar um
preço, todo o histórico de "total pago" de todos os tenants muda
retroactivamente. `subscription_history` devia guardar o preço pago como
snapshot na altura.

### 2.7 `useLicense` faz polling de 5 em 5 minutos em vez de Realtime

Consome dados/bateria sem necessidade (o recurso mais escasso no
mercado-alvo) para um evento raro. Quando o superadmin activa um plano, o
dono só vê a mudança até 5 minutos depois — o resto da app já usa Realtime
(`subscribeOperations` para orders/tables); a tabela `subscriptions` merece o
mesmo tratamento, sobretudo por ser um momento de alto valor emocional
("acabei de pagar, quero ver logo").

### 2.8 Sem edição/correcção manual de turnos

Se um funcionário esquecer de bater a saída, fica "Em curso" indefinidamente
— não há forma de um manager corrigir isto em `ShiftsPage`. Combinado com a
falta de filtro por intervalo de datas e exportação (que Relatórios já tem),
é a lacuna mais óbvia da página.

### 2.9 Validação numérica inconsistente entre formulários

`InventoryPage` deixa introduzir `costPerUnit`/`currentStock`/`minStock`
negativos (sem `min` no HTML nem validação JS) — distorce `totalValue` e o
cálculo de stock baixo. `TablesPage`, por comparação, já valida correctamente
(`min={1}`, desabilita Guardar). É inconsistência a corrigir copiando o
padrão que já existe noutro sítio da mesma app.

### 2.10 Confirmação de acções destrutivas é inconsistente

`TablesPage` usa `window.confirm()` nativo; `ExpensesPage`/`DataArchivePage`/
`SuperAdminPage` usam `AlertDialog` estilizado; `InventoryPage` **não pede
confirmação nenhuma** para apagar um ingrediente (nem avisa se está ligado a
uma receita, deixando-a órfã). Vale unificar tudo no padrão `AlertDialog` já
estabelecido.

### 2.11 Sem histórico/auditoria em ajustes de fidelidade

Bónus/resgates de pontos em `CustomersPage` só actualizam o acumulado —
zero registo de quem/quando/porquê, ao contrário de `expense_amount_history`
(já construído nesta sessão) e `staff_salaries`, que seguem correctamente
esse padrão. Mesma lacuna nos proformas emitidos (numeração não-sequencial,
não persistida).

### 2.12 Lógica de negócio duplicada em pelo menos 3 sítios

- Cálculo de pontos/nível de fidelidade: `CustomersPage.computeStats` e
  `customerReport.buildCustomerReport` reimplementam a mesma fórmula
  independentemente.
- `generateId()`: implementações distintas em `store.ts` e `useRestaurant.ts`.
- Grid de planos + desconto multi-restaurante: `PricingPage` e `BillingPage`
  duplicam quase o mesmo código.

Isto é exactamente o tipo de coisa que já causou um bug real nesta sessão
(`computeStats` do lado de Relatórios, resolvido extraindo para
`reportStats.ts`) — mesmo tratamento seria valioso aqui.

### 2.13 Recipe mock data confunde dados de demonstração com produção

`KitchenOrderDetail.tsx` tem um dicionário `RECIPES` hardcoded (4 receitas
por nome exacto tipo "Pizza Pepperoni") usado como fallback quando um prato
não tem receita própria — para qualquer restaurante real, nunca dispara, mas
fica lá como resíduo confuso. Os `step.done` desse mock também nunca batem
com o comportamento real (a app não persiste progresso passo-a-passo).

### 2.14 Sem impressão térmica real (ESC/POS)

Recibos, recibos em lote e proforma dependem todos de `window.print()`/
"Guardar como PDF" do browser — nenhum suporta impressoras térmicas
Bluetooth/USB directamente. Para um POS físico em produção (não só um
browser), isto é uma limitação real. Os três também falham em silêncio se o
pop-up for bloqueado (`if (!w) return`), sem avisar o utilizador.

---

## 3. Lacunas operacionais menores (mas reais)

- **Mesas**: um pedido não-pago com dois registos activos na mesma mesa fica
  parcialmente invisível (`getTableOrder` usa `.find`, não `.filter`); QR
  code não é exportável/imprimível em lote; sem zonas/pisos; sem reserva com
  hora/nome de cliente associado.
- **Cozinha**: alertas de atraso vivem em `useState` local — perdem-se ao
  recarregar a página; sem som/vibração (só toast visual, fácil de não notar
  num ambiente barulhento); "Concluir Todos" sem confirmação.
- **Inventário**: sem histórico de movimentos de stock (só o valor actual);
  sem data de validade para perecíveis; sem entrada de stock em lote
  (compra a fornecedor); sem ligação a fornecedores.
- **Clientes**: sem paginação (`CustomerGrid` renderiza tudo de uma vez);
  detecção "online" usa só `navigator.onLine` (falso positivo comum); sem
  forma de fundir clientes duplicados nem reatribuir pedidos antigos a um
  cliente diferente.
- **Acompanhamento do cliente** (`CustomerTrackingPage`): polling fixo de 4s
  em vez de Realtime (já disponível via `subscribeOperations`); sem
  tratamento de erro de rede durante o polling; sem indicação de método de
  pagamento nem tempo estimado.
- **Landing/Signup**: telefone no signup não passa por `validateIntlPhone`
  (ao contrário de todos os outros campos de telefone da app); sem
  Termos/Privacidade visíveis em lado nenhum; sem FAQ nem contacto pré-venda.
- **PWA**: `registerSW` não avisa o utilizador quando há uma versão nova
  disponível (`onNeedRefresh` do plugin não está ligado) — num contexto de
  rede fraca, um dispositivo pode ficar meses preso numa versão antiga.
- **Validações MZ**: `validateBankAccount`/`validateNuit` aceitam qualquer
  sequência de dígitos do tamanho certo, sem dígito de controlo — aceitável
  para MVP, zero protecção contra erro de digitação num pagamento real.

---

## 4. Funcionalidades novas — por área

### Operações do dia-a-dia
- **Dividir conta / pagamento parcial** — hoje `completeOrder` só sabe pagar
  um pedido inteiro de uma vez; é uma funcionalidade clássica de POS que
  falta.
- **Mover/juntar mesas** — mudar um pedido de mesa, juntar duas mesas para
  um grupo grande.
- Modo TV para a cozinha (ecrã simplificado sem sidebar, para um monitor
  dedicado) e som de alerta configurável.
- Tempo médio de preparo por prato (os eventos `item-preparing`/`item-ready`
  já existem — só falta agregar).
- Reordenar o board da cozinha por tempo de espera (mais antigo em destaque).

### Inventário e fornecedores
- Registo de entradas de stock com custo por lote (histórico de custo ao
  longo do tempo, não só o "actual").
- Data de validade opcional por lote + alerta de expiração.
- Sugestão automática de quantidade a encomendar com base no consumo médio.
- Ficha de fornecedor por item (nome/contacto), exportar lista de stock
  baixo para partilhar directamente.

### Fidelidade e clientes
- Histórico auditável de ajustes de pontos (mesmo padrão de
  `expense_amount_history`).
- Pontos por categoria/multiplicador por nível, e expiração de pontos.
- Lembrete/notificação automática de aniversário (hoje só filtra por mês).
- Segmentação para campanhas ("inactivos há X dias", "Ouro") e fusão de
  clientes duplicados.
- Templates de mensagem WhatsApp configuráveis (hoje o texto está fixo no
  componente).

### Equipa e turnos
- Edição manual de turno por manager (corrigir entrada/saída esquecida) —
  a lacuna mais concreta desta área.
- Filtro por intervalo de datas + exportação de turnos (paridade com
  Relatórios).
- Cruzar horas trabalhadas × salário para custo de mão-de-obra directo em
  Turnos (hoje só existe em Despesas, sem ligação nenhuma).
- Escala/horário planeado vs. horas reais batidas.

### Relatórios e documentos
- Export Excel no relatório de clientes (Relatórios/Arquivo de Dados já
  ganharam isto nesta sessão; Clientes ainda só tem CSV/PDF).
- QR code no recibo (link de feedback ou de fidelidade) — oportunidade
  desperdiçada de trazer o cliente de volta.
- Persistir proformas emitidos com numeração sequencial real, e permitir
  gerar a partir de um carrinho/pedido real (não só a lista completa do
  cardápio).
- Recibo/factura da própria subscrição SaaS, para o dono do restaurante
  guardar na contabilidade dele.

### Conta e plataforma
- Fluxo de reset de password.
- Páginas de Termos/Privacidade + FAQ na landing.
- Aviso proactivo de expiração de plano (banner, não só o badge pequeno na
  sidebar) e validação client-side antes de downgrade para Básico se os
  limites já estiverem excedidos.
- Notificação (push/email/WhatsApp automático) quando chega um novo
  comprovativo de pagamento ou feedback, em vez de pull-only.
- Horário de funcionamento configurável, com bloqueio automático de pedidos
  do cliente fora de horas.

---

## 5. Padrões cruzados (dívida técnica transversal)

Coisas que aparecem repetidas em várias partes do sistema — vale tratá-las
como categoria, não caso a caso:

1. **"Resolve sempre, nunca rejeita, avisa por toast"** é uma disciplina
   consistente em toda a camada de sync — boa prática deliberada para não
   quebrar a UI numa rede fraca, mas esconde falhas sistemáticas atrás de
   `.catch(() => null)` em vários sítios, sem nenhum canal central de "isto
   está a falhar repetidamente".
2. **Nenhum documento gerado (recibo, recibo em lote, proforma) usa PDF
   nativo** — todos dependem de `window.print()`, ao contrário dos
   relatórios (Reports/DataArchive/Customers), que já usam jsPDF
   directamente. E os três falham em silêncio se o pop-up for bloqueado.
3. **Falta de histórico/auditoria** é recorrente: pontos de fidelidade,
   proformas, ajustes de turno — só despesas e salários (construídos nesta
   sessão) seguem correctamente o padrão append-only.
4. **Confirmação de acções destrutivas inconsistente** entre páginas
   (nativa vs. `AlertDialog` vs. nenhuma).
5. **Duplicação de lógica de negócio** (fidelidade, `generateId`, grid de
   planos) — mesmo risco que já se materializou uma vez nesta sessão.
6. **Listas mantidas à mão que podiam ser geradas** (`TENANT_CACHE_BASES`,
   dicionário `RECIPES`, `imageMap` de `helpers.ts`) — resíduos de
   demonstração ou manutenção manual frágil.

---

## 6. Prioridades recomendadas (antes de divulgar a sério)

Dado que ainda não há clientes reais, sugiro esta ordem:

1. **Onboarding guiar para cardápio/mesas** (§2.1) — o maior risco de
   abandono no primeiro dia de um cliente real.
2. **Reset de password** (§2.2) — barato de fazer, caro de não ter.
3. **Notificação de comprovativos/feedback** (§2.3) — deixa de ser opcional
   assim que houver mais do que uma conversa de WhatsApp para acompanhar.
4. **Limite/purga na fila de sync + registo do que "Limpar fila" apaga**
   (§2.4) — proteger contra o cenário mais provável no mercado-alvo real
   (rede instável, dispositivo offline prolongado).
5. **Decidir o destino do Stripe** (§2.5) — remover ou formalizar, não
   deixar morto a confundir.
6. Tudo o resto da secção 2 pode esperar por depois do lançamento — são
   lacunas reais mas nenhuma bloqueia o uso do sistema por um restaurante
   real hoje.

As funcionalidades da secção 4 são todas aditivas — nenhuma é pré-requisito
para lançar, mas "dividir conta", "editar turno manualmente" e "histórico de
fidelidade" são provavelmente as três que um dono de restaurante real pediria
primeiro depois de começar a usar o sistema no dia-a-dia.
