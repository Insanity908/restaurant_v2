/**
 * Isolamento local por restaurante (tenant).
 *
 * Todas as caches locais de dados operacionais são guardadas com o prefixo do
 * tenant activo. Nunca usamos uma chave "global" como fallback — sem tenant
 * activo escrevemos num espaço isolado (`__no_tenant__`) que nunca é lido por
 * outro restaurante.
 */

const CURRENT_TENANT_KEY = 'current_tenant_id';
const NO_TENANT = '__no_tenant__';

/** Sufixos de caches que pertencem a um restaurante específico. */
export const TENANT_CACHE_BASES = [
  'menu_items', 'tables', 'orders', 'inventory', 'customers',
  'staff', 'security_alerts', 'shifts', 'loyalty_settings', 'app_settings_v1',
];

export function activeTenantId(): string | null {
  return localStorage.getItem(CURRENT_TENANT_KEY);
}

/** Chave sempre isolada por tenant (nunca partilhada entre restaurantes). */
export function tenantScopedKey(base: string): string {
  return `${activeTenantId() ?? NO_TENANT}__${base}`;
}

/** Remove todas as caches locais de dados de restaurantes (usado no logout). */
export function purgeTenantCaches(): void {
  const toRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k) continue;
    const base = k.includes('__') ? k.slice(k.indexOf('__') + 2) : k;
    if (TENANT_CACHE_BASES.includes(base)) toRemove.push(k);
  }
  // Caches globais que também dependem da conta autenticada.
  toRemove.push('tenants');
  toRemove.forEach(k => localStorage.removeItem(k));
}

/**
 * Auditoria de isolamento: devolve as chaves de cache de dados de restaurante
 * que estão guardadas sem prefixo de tenant (ou seja, partilhadas entre
 * restaurantes). Deve ser sempre uma lista vazia.
 */
export function findSharedTenantCacheKeys(): string[] {
  const offenders: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k) continue;
    // Uma chave isolada tem sempre a forma `<tenantId>__<base>`.
    if (TENANT_CACHE_BASES.includes(k)) offenders.push(k);
  }
  return offenders;
}

/**
 * Verificação automática executada no arranque e sempre que a sessão muda:
 * apaga qualquer cache global partilhada entre restaurantes (resíduos de
 * versões antigas da app) para garantir isolamento no dispositivo.
 */
export function enforceTenantCacheIsolation(): string[] {
  const offenders = findSharedTenantCacheKeys();
  offenders.forEach(k => localStorage.removeItem(k));
  if (offenders.length) {
    console.warn('[isolamento] caches globais removidas:', offenders.join(', '));
  }
  return offenders;
}
