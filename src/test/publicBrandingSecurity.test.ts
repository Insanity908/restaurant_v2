import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * `get_public_branding` é a ÚNICA função que expõe `app_settings` a `anon`
 * (a página de pedido do cliente não tem sessão) — `app_settings.data` é um
 * jsonb único que também guarda dados de pagamento sensíveis (mpesaNumber,
 * bankAccount, bankIban, emolaNumber, chaves fiscais, etc.). Um `select *`
 * ou um `jsonb_build_object` alargado por engano num refactor futuro
 * vazaria esses dados publicamente, sem precisar de sessão nenhuma.
 *
 * Isto não substitui um teste de integração real (chamar a RPC como `anon`
 * contra um projecto Supabase de teste — ver §2.1.1/§2.3.1 da spec, ainda
 * por fazer), mas apanha o erro mais provável — um refactor que alarga os
 * campos devolvidos — sem precisar de nenhuma infraestrutura, correndo como
 * parte normal da suite unit.
 */

const ROOT = resolve(__dirname, '../..');

const ALLOWED_BRANDING_KEYS = [
  'brandName', 'iconEmoji', 'iconUrl',
  'primaryHue', 'primarySaturation', 'primaryLightness',
  'backgroundHue', 'backgroundSaturation', 'backgroundLightness',
];

// Campos de app_settings.data que NUNCA podem aparecer numa função pública —
// nomes reais vistos em src/lib/settings.ts (AppSettings).
const SENSITIVE_SETTINGS_FIELDS = [
  'mpesaNumber', 'mpesaName', 'emolaNumber', 'bankName', 'bankAccount',
  'bankIban', 'bankHolder', 'taxId', 'address', 'phone', 'receiptLogo',
];

function extractFunctionBody(sql: string, functionName: string): string {
  const start = sql.indexOf(`create or replace function public.${functionName}`);
  if (start === -1) throw new Error(`Função ${functionName} não encontrada no ficheiro`);
  const bodyStart = sql.indexOf('$$', start);
  const bodyEnd = sql.indexOf('$$', bodyStart + 2);
  if (bodyStart === -1 || bodyEnd === -1) throw new Error(`Corpo de ${functionName} não delimitado por $$ como esperado`);
  return sql.slice(bodyStart + 2, bodyEnd);
}

function extractJsonbKeys(functionBody: string): string[] {
  // jsonb_build_object('chave', s.data->>'chave', ...) — o valor É a mesma
  // string entre aspas outra vez (path do jsonb), por isso um regex ingénuo
  // de "qualquer string seguida de vírgula" apanhava a chave DUAS vezes. A
  // chave verdadeira é sempre a que vem imediatamente antes de `s.data->>`.
  const matches = [...functionBody.matchAll(/'([a-zA-Z0-9_]+)',\s*\(?s\.data->>/g)];
  return matches.map(m => m[1]);
}

describe('Segurança: get_public_branding nunca expõe campos sensíveis de app_settings', () => {
  const migrationSql = readFileSync(
    resolve(ROOT, 'supabase/migrations/20260821092000_public_branding.sql'), 'utf8',
  );
  const schemaSql = readFileSync(resolve(ROOT, 'supabase/schema_clean_install.sql'), 'utf8');

  it.each([
    ['migration', migrationSql],
    ['schema_clean_install.sql', schemaSql],
  ])('%s: devolve exactamente as 9 chaves de marca/cores permitidas — nem mais, nem menos', (_label, sql) => {
    const body = extractFunctionBody(sql, 'get_public_branding');
    const keys = extractJsonbKeys(body);
    expect(new Set(keys)).toEqual(new Set(ALLOWED_BRANDING_KEYS));
    expect(keys).toHaveLength(ALLOWED_BRANDING_KEYS.length);
  });

  it.each([
    ['migration', migrationSql],
    ['schema_clean_install.sql', schemaSql],
  ])('%s: o corpo da função não referencia nenhum campo sensível de pagamento/fiscal', (_label, sql) => {
    const body = extractFunctionBody(sql, 'get_public_branding');
    for (const field of SENSITIVE_SETTINGS_FIELDS) {
      expect(body).not.toContain(field);
    }
  });

  it.each([
    ['migration', migrationSql],
    ['schema_clean_install.sql', schemaSql],
  ])('%s: nunca devolve o objecto app_settings.data inteiro (sem select * / sem s.data solto)', (_label, sql) => {
    const body = extractFunctionBody(sql, 'get_public_branding');
    expect(body).not.toMatch(/select\s+\*/i);
    // `s.data` sozinho (sem `->>`/`->` a seguir) devolveria o jsonb inteiro.
    expect(body).not.toMatch(/s\.data(?!\s*->)/);
  });

  it('a migration e o schema_clean_install.sql definem exactamente as mesmas chaves (sem drift)', () => {
    const migrationKeys = new Set(extractJsonbKeys(extractFunctionBody(migrationSql, 'get_public_branding')));
    const schemaKeys = new Set(extractJsonbKeys(extractFunctionBody(schemaSql, 'get_public_branding')));
    expect(schemaKeys).toEqual(migrationKeys);
  });

  it('é acessível a anon (senão a página do cliente, sem sessão, nunca a conseguiria chamar)', () => {
    expect(migrationSql).toMatch(/grant execute on function public\.get_public_branding\(uuid\) to anon, authenticated/);
    expect(schemaSql).toMatch(/grant execute on function public\.get_public_branding\(uuid\) to anon, authenticated/);
  });
});

describe('Segurança: now_utc não aceita parâmetros do cliente', () => {
  const migrationSql = readFileSync(resolve(ROOT, 'supabase/migrations/20260819080000_server_clock.sql'), 'utf8');
  const schemaSql = readFileSync(resolve(ROOT, 'supabase/schema_clean_install.sql'), 'utf8');

  it.each([
    ['migration', migrationSql],
    ['schema_clean_install.sql', schemaSql],
  ])('%s: a função now_utc() não declara nenhum parâmetro (sem superfície de ataque)', (_label, sql) => {
    // Aceita 'now_utc()' exacto — qualquer coisa entre os parênteses seria um parâmetro novo.
    expect(sql).toMatch(/create or replace function public\.now_utc\(\)/);
  });

  it.each([
    ['migration', migrationSql],
    ['schema_clean_install.sql', schemaSql],
  ])('%s: é acessível a anon/authenticated (senão a correcção de relógio falha silenciosamente para o cliente)', (_label, sql) => {
    expect(sql).toMatch(/grant execute on function public\.now_utc\(\) to anon, authenticated/);
  });
});
