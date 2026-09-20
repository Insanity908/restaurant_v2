import { describe, it, expect, vi } from 'vitest';

/**
 * Bug real (screenshot): a página pública de pedido (QR/entrega) aparecia
 * sem nenhuma cor — só a estrutura do Tailwind (bordas, espaçamento),
 * texto preto sobre fundo branco.
 *
 * Causa: get_public_branding() usa jsonb_build_object() no Postgres, que
 * inclui as chaves de cor com valor `null` quando o restaurante nunca
 * personalizou a marca, em vez de omitir a chave. O caller fazia
 * `{ ...DEFAULT_SETTINGS, ...branding }` — um `null` explícito sobrepõe o
 * bom default, e deriveThemeTokens() interpola isso directamente numa
 * string HSL ("null 95% 55%"), CSS inválido, quebrando --primary/
 * --background/etc. em toda a página.
 *
 * fetchPublicBranding() agora descarta chaves null/undefined antes de
 * devolver, para nunca sobrepor os defaults com "ausência de cor".
 */

const rpcMock = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: (...args: unknown[]) => rpcMock(...args) },
}));

import { fetchPublicBranding } from '@/lib/customerOrder';

describe('fetchPublicBranding() descarta campos null da RPC', () => {
  it('remove primaryHue/backgroundHue nulos em vez de os devolver', async () => {
    rpcMock.mockResolvedValueOnce({
      data: {
        brandName: 'TESTE - Investigação (apagar)',
        iconEmoji: null,
        iconUrl: null,
        primaryHue: null,
        primarySaturation: null,
        primaryLightness: null,
        backgroundHue: null,
        backgroundSaturation: null,
        backgroundLightness: null,
      },
      error: null,
    });

    const branding = await fetchPublicBranding('tenant-1');

    expect(branding).toEqual({ brandName: 'TESTE - Investigação (apagar)' });
    expect(branding).not.toHaveProperty('primaryHue');
    expect(branding).not.toHaveProperty('backgroundHue');
  });

  it('mantém valores reais quando o restaurante personalizou a marca', async () => {
    rpcMock.mockResolvedValueOnce({
      data: { brandName: 'Sabor', primaryHue: 200, primarySaturation: 80, primaryLightness: 50 },
      error: null,
    });

    const branding = await fetchPublicBranding('tenant-1');

    expect(branding).toEqual({ brandName: 'Sabor', primaryHue: 200, primarySaturation: 80, primaryLightness: 50 });
  });

  it('devolve null quando a RPC não devolve nenhuma linha (tenant sem app_settings)', async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: null });
    expect(await fetchPublicBranding('tenant-1')).toBeNull();
  });
});
