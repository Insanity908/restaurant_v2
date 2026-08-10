import { describe, it, expect, beforeEach } from 'vitest';
import {
  tenantScopedKey,
  findSharedTenantCacheKeys,
  enforceTenantCacheIsolation,
  purgeTenantCaches,
} from '@/lib/localCache';

describe('isolamento de caches por restaurante', () => {
  beforeEach(() => localStorage.clear());

  it('gera sempre chaves com prefixo de tenant', () => {
    localStorage.setItem('current_tenant_id', 't1');
    expect(tenantScopedKey('orders')).toBe('t1__orders');
    localStorage.removeItem('current_tenant_id');
    expect(tenantScopedKey('orders')).toBe('__no_tenant____orders');
  });

  it('detecta e remove caches globais partilhadas', () => {
    localStorage.setItem('orders', '[]');
    localStorage.setItem('app_settings_v1', '{}');
    localStorage.setItem('t1__orders', '[]');
    expect(findSharedTenantCacheKeys().sort()).toEqual(['app_settings_v1', 'orders']);
    enforceTenantCacheIsolation();
    expect(findSharedTenantCacheKeys()).toEqual([]);
    expect(localStorage.getItem('t1__orders')).toBe('[]');
  });

  it('purga caches de todos os restaurantes no logout', () => {
    localStorage.setItem('t1__orders', '[]');
    localStorage.setItem('t2__customers', '[]');
    purgeTenantCaches();
    expect(localStorage.getItem('t1__orders')).toBeNull();
    expect(localStorage.getItem('t2__customers')).toBeNull();
  });
});
