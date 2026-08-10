import type { AxeResults, Result } from 'axe-core';

/**
 * `jest-axe` exporta `toHaveNoViolations`, mas o matcher em si é
 * incompatível com o `expect` do Vitest (TypeError: expectAssertion.call is
 * not a function — problema conhecido, não é específico deste projecto).
 * Em vez de depender do matcher, avaliamos `results.violations`
 * directamente e formatamos uma mensagem legível para quando algo falhar.
 */
export function describeViolations(results: AxeResults): string {
  return results.violations
    .map((v: Result) => {
      const nodes = v.nodes.map(n => `    - ${n.target.join(' ')}\n      ${n.failureSummary}`).join('\n');
      return `[${v.id}] ${v.help} (${v.helpUrl})\n${nodes}`;
    })
    .join('\n\n');
}

export function expectNoViolations(results: AxeResults): void {
  if (results.violations.length > 0) {
    throw new Error(`${results.violations.length} violação(ões) de acessibilidade:\n\n${describeViolations(results)}`);
  }
}
