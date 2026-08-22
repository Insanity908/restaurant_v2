import { describe, it, expect, vi } from 'vitest';

/**
 * Regressão: `subscriptions.tenant_id` é PRIMARY KEY (1:1 com tenants), por
 * isso o PostgREST embebe `subscriptions` como um OBJECTO único, não um
 * array — `mapRow()` fazia `r.subscriptions?.[0]`, que é sempre `undefined`
 * nesse caso. Todo o Super Admin mostrava "trial / 0 dias" para qualquer
 * restaurante, e bloquear/estender/reduzir/activar pareciam não fazer nada
 * (a escrita chegava ao servidor, só nunca aparecia no ecrã porque o
 * `fetchTenants()`/`fetchTenant()` seguintes liam sempre os valores por
 * omissão). Este teste mocka o `select(...)` do Supabase exactamente com a
 * forma real (objecto, não array) para apanhar a regressão se voltar.
 */

const TENANT_ROW = {
  id: 'tenant-1', name: 'Mae', owner_email: 'sandra@teste.mz', owner_phone: null,
  license_key: 'lic_abc', created_at: '2026-08-01T00:00:00.000Z',
  subscriptions: {
    plan: 'monthly', status: 'blocked', started_at: '2026-08-01T00:00:00.000Z',
    expires_at: '2026-09-13T00:00:00.000Z', last_payment_ref: null,
    blocked_by_admin: true, block_reason: 'Teste de verificação',
  },
  subscription_history: [{ plan: 'monthly', paid_at: '2026-08-01T00:00:00.000Z', ref: null, price: 3600 }],
};

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        order: () => Promise.resolve({ data: [TENANT_ROW], error: null }),
      }),
    }),
  },
}));

import { fetchTenants } from '@/lib/tenants';

describe('fetchTenants — mapeamento de subscriptions (embed 1:1, não array)', () => {
  it('lê status/expiresAt/blockedByAdmin reais em vez de cair sempre nos valores por omissão', async () => {
    const list = await fetchTenants();
    expect(list).toHaveLength(1);
    expect(list[0].subscription).toMatchObject({
      plan: 'monthly',
      status: 'blocked',
      blockedByAdmin: true,
      blockReason: 'Teste de verificação',
      expiresAt: '2026-09-13T00:00:00.000Z',
    });
  });
});
