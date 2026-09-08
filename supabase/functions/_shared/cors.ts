// Achado de baixa severidade do pentest de 2026-09-08
// ([[active_pentest_2026_09_08]]): todas as 11 Edge Functions respondiam com
// `Access-Control-Allow-Origin: *`. Agora restrito ao domínio real de
// produção + localhost para desenvolvimento.
const ALLOWED_ORIGINS = new Set([
  'https://www.jsetra.com',
  'https://jsetra.com',
  'http://localhost:8080',
]);

/** Chamar uma vez por pedido, logo a seguir a `Deno.serve(async (req) => {`,
 * com `req.headers.get('origin')`. Reflecte a origem só se estiver na
 * allowlist; caso contrário devolve o domínio de produção (o browser do
 * chamador não autorizado continua a bloquear a leitura da resposta, porque
 * o valor devolvido não corresponde à origem real dele). */
export function buildCorsHeaders(origin: string | null) {
  const allowOrigin = origin && ALLOWED_ORIGINS.has(origin) ? origin : 'https://www.jsetra.com';
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'X-Content-Type-Options': 'nosniff',
    'Vary': 'Origin',
  };
}
