import './commands';

// Regista os mocks genéricos (catálogo vazio, resolve_login_email,
// subscription-status) ANTES de cada teste, incluindo antes de qualquer
// cy.intercept()/cy.loginAs() escrito no próprio spec. Isto garante que a
// ordem em que um spec escreve os seus intercepts específicos nunca é
// "apanhada" por este mock genérico — o genérico está sempre registado
// primeiro, o específico do spec vem sempre depois (e o Cypress dá
// prioridade ao intercept mais recentemente registado).
beforeEach(() => {
  cy.mockSupabaseBaseline();
});

// Erros de terceiros (ex: ResizeObserver, extensões do browser) não devem
// reprovar um teste que passou funcionalmente. Erros lançados pelo PRÓPRIO
// código da app continuam a reprovar o teste normalmente.
Cypress.on('uncaught:exception', (err) => {
  if (/ResizeObserver loop/.test(err.message)) return false;
  return true;
});
