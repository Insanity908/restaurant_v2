import { describe, it, expect } from 'vitest';
import { shouldHideSidebar } from '@/App';

/**
 * T3.6: modo TV da Cozinha (?tv=1) — monitor dedicado, sem sidebar/navegação.
 * `shouldHideSidebar` é a regra pura extraída de `ConditionalSidebar` em
 * App.tsx, testada aqui sem montar a app inteira.
 */
describe('shouldHideSidebar — modo TV da Cozinha', () => {
  it('esconde a sidebar em /kitchen?tv=1', () => {
    expect(shouldHideSidebar('/kitchen', '?tv=1', true)).toBe(true);
  });

  it('mantém a sidebar em /kitchen sem o parâmetro tv', () => {
    expect(shouldHideSidebar('/kitchen', '', true)).toBe(false);
  });

  it('mantém a sidebar em /kitchen com tv diferente de "1"', () => {
    expect(shouldHideSidebar('/kitchen', '?tv=0', true)).toBe(false);
  });

  it('não esconde a sidebar noutra rota mesmo com ?tv=1 (só se aplica à Cozinha)', () => {
    expect(shouldHideSidebar('/pos', '?tv=1', true)).toBe(false);
  });

  it('continua a esconder a sidebar nas rotas já existentes (regressão)', () => {
    expect(shouldHideSidebar('/login', '', false)).toBe(true);
    expect(shouldHideSidebar('/pedir/tenant-1/mesa/table-1', '', false)).toBe(true);
    expect(shouldHideSidebar('/', '', false)).toBe(true);
  });
});
