# Testes E2E (Cypress)

## ⚠️ Não consegui correr esta suite

Escrevi e revi todos os specs linha a linha contra o código-fonte real de
cada página, e o pacote `cypress` está instalado — mas o **binário**
(Electron, ~200MB) descarrega-se de `download.cypress.io`, um domínio a que
não tenho acesso de rede neste ambiente (erro `403 Forbidden` confirmado ao
tentar `npx cypress install`). Não há forma de contornar isto por aqui — a
CLI do Cypress precisa sempre do seu próprio binário, independentemente de
qual browser lhe pedires para conduzir.

**O que isto significa na prática:** verifiquei tudo o que era possível
verificar sem executar (`tsc` sobre todos os specs — zero erros; `eslint`
sobre `cypress/` — zero erros; cada selector, texto de botão, nome de campo
e forma exacta do payload HTTP foi confirmado lendo o componente React
real, não assumido). Mas **nunca vi nenhum destes testes passar de facto**.
É expectável que precises de fazer pequenos ajustes na primeira corrida —
sobretudo selectores de UI que dependam de comportamento do Radix
(popovers, selects) que só se manifesta num browser real.

## Como correr

```bash
npm install        # já traz o cypress como devDependency
npm run dev         # noutro terminal — a suite espera http://localhost:5173
npm run e2e:open     # interface gráfica, corre um spec de cada vez (recomendado na 1ª vez)
npm run e2e:run      # modo headless, corre tudo de uma vez (CI)
```

## Como funciona (a decisão mais importante desta suite)

**Nenhum destes testes toca a tua instância real do Supabase.** Cada
pedido que o `supabase-js` faria (login, leitura/escrita REST, RPC, edge
functions) é interceptado com `cy.intercept()` antes de sair do browser —
ver `cypress/support/commands.ts`. Isto foi deliberado:

- Corre em qualquer máquina/CI sem precisares de configurar um projecto
  Supabase de teste nem de gerir dados de seed.
- Cada cenário (sucesso, erro 500, 409 de duplicado, RLS a bloquear) é
  100% determinístico — defines exactamente a resposta que queres testar.
- **O que isto NÃO testa:** as políticas RLS reais. Isso já foi validado à
  parte, directamente contra Postgres — ver `supabase/schema_clean_install.sql`
  e a bateria de testes que correu contra ele (não faz parte desta pasta).
  Esta suite testa a **aplicação**: se o botão certo aparece para o papel
  certo, se os formulários validam antes de submeter, se os pedidos HTTP
  que SERIAM enviados têm a forma certa, e como a UI reage a respostas de
  erro do servidor.

### `cy.loginAs(papel)`

Não injecta sessão nenhuma no `localStorage`. Passa pelo ecrã de login a
sério — escreve email/password, submete o formulário — exactamente como um
utilizador faria. Usa `cy.session()` para não repetir isto em cada teste do
mesmo ficheiro (a sessão fica em cache; se expirar/for inválida, o Cypress
volta a correr o login automaticamente).

### Ordem dos mocks — um pormenor importante se fores adicionar specs novos

Os mocks genéricos (tabelas de catálogo vazias, `resolve_login_email`,
`subscription-status`) estão registados num `beforeEach` **global**, em
`cypress/support/e2e.ts` — correm sempre antes de qualquer coisa que
escrevas dentro de um `it()` ou de um `beforeEach` local. Isto significa
que os teus intercepts específicos (com dados concretos) ganham sempre,
**não importa se os escreves antes ou depois de `cy.loginAs()`** dentro do
teste. Não movas a chamada a `cy.mockSupabaseBaseline()` para dentro de um
`describe`/`it()` — se o fizeres depois de um intercept específico teu, o
genérico ganha e o teu fica sem efeito.

## O que cada ficheiro cobre

| Ficheiro | Cobre |
|---|---|
| `01-auth.cy.ts` | Login (email e username) para os 6 papéis; password errada; utilizador inexistente; campos vazios; erro 500 do servidor |
| `02-signup.cy.ts` | Validações do formulário de registo; sucesso (chama `bootstrap-tenant`); falha do `bootstrap-tenant` |
| `03-route-permissions.cy.ts` | Matriz completa: 6 papéis × 14 rotas — permitido/bloqueado |
| `04-dashboard.cy.ts` | Redireccionamento pós-login por papel |
| `05-menu.cy.ts` | Ver vs. gerir cardápio; criar/desactivar prato; limites de permissão |
| `06-tables.cy.ts` | CRUD de mesas; conflito de número; mesa ocupada não se remove |
| `07-kitchen.cy.ts` | Ciclo de estado dos itens (pendente → preparando → pronto → servido) |
| `08-pos.cy.ts` | Checkout; bloqueio por itens não servidos; métodos de pagamento |
| `09-inventory.cy.ts` | CRUD de stock; exclusivo admin/manager |
| `10-customers.cy.ts` | CRUD de clientes; validação de telefone moçambicano |
| `11-shifts.cy.ts` | Bater ponto (entrada/saída); turno duplicado |
| `12-staff.cy.ts` | Criar funcionário (conta real + PIN); matriz de atribuição de papéis; username duplicado |
| `13-settings.cy.ts` | Exclusivo admin; nome do estabelecimento; username duplicado |
| `14-billing-pricing.cy.ts` | Exclusivo admin; planos disponíveis |
| `15-onboarding.cy.ts` | Unidade extra; convite de equipa; PIN duplicado |
| `16-superadmin.cy.ts` | Bloquear/desbloquear/estender/eliminar restaurante; exclusivo superadmin |
| `17-blocked-notfound.cy.ts` | Conta bloqueada vs. expirada; 404 |

## Limitações conhecidas (por falta de poder correr)

- Selectores de componentes Radix (`Select`, `Popover`) podem precisar de
  ajuste — o comportamento de portal/animação só se vê num browser real.
- Alguns testes assumem uma única linha de resultado nas respostas mock;
  se a query real devolver múltiplas linhas (paginação, joins), pode ser
  preciso ajustar a forma dos fixtures.
- Não cobre: upload de imagens (Menu/Configurações), impressão de recibos,
  PWA/offline, e-mail de confirmação de conta.
