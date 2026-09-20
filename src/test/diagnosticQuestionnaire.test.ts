import { describe, it, expect } from 'vitest';
import {
  QUESTIONNAIRE_SECTIONS, emptyQuestionnaireAnswers, isFieldVisible,
} from '@/lib/diagnosticQuestionnaire';

describe('emptyQuestionnaireAnswers()', () => {
  it('inicializa todos os campos — arrays para "multi", string vazia para os restantes', () => {
    const answers = emptyQuestionnaireAnswers();
    const allKeys = QUESTIONNAIRE_SECTIONS.flatMap(s => s.fields.map(f => f.key));
    allKeys.forEach(key => expect(answers).toHaveProperty(key));

    const multiKeys = QUESTIONNAIRE_SECTIONS.flatMap(s => s.fields.filter(f => f.type === 'multi').map(f => f.key));
    multiKeys.forEach(key => expect(answers[key]).toEqual([]));
  });
});

describe('isFieldVisible()', () => {
  it('campo sem showIf está sempre visível', () => {
    expect(isFieldVisible({ key: 'x', type: 'text' }, {})).toBe(true);
  });

  it('showIf.equals só mostra quando o campo referido tem esse valor exacto', () => {
    const field = { key: 'tipoOutro', type: 'text' as const, showIf: { key: 'tipo', equals: 'Outro' } };
    expect(isFieldVisible(field, { tipo: 'Outro' })).toBe(true);
    expect(isFieldVisible(field, { tipo: 'Bar' })).toBe(false);
    expect(isFieldVisible(field, {})).toBe(false);
  });

  it('showIf.includes só mostra quando o valor (array) contém a opção', () => {
    const field = { key: 'pedidosComoOutro', type: 'text' as const, showIf: { key: 'pedidosComo', includes: 'Outro' } };
    expect(isFieldVisible(field, { pedidosComo: ['WhatsApp', 'Outro'] })).toBe(true);
    expect(isFieldVisible(field, { pedidosComo: ['WhatsApp'] })).toBe(false);
    expect(isFieldVisible(field, {})).toBe(false);
  });
});

describe('QUESTIONNAIRE_SECTIONS — integridade do esquema', () => {
  it('cada chave de campo é única em todas as secções', () => {
    const keys = QUESTIONNAIRE_SECTIONS.flatMap(s => s.fields.map(f => f.key));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('todo showIf aponta para uma chave que existe no esquema', () => {
    const keys = new Set(QUESTIONNAIRE_SECTIONS.flatMap(s => s.fields.map(f => f.key)));
    QUESTIONNAIRE_SECTIONS.forEach(section => {
      section.fields.forEach(field => {
        if (field.showIf) expect(keys.has(field.showIf.key)).toBe(true);
      });
    });
  });

  it('todo campo choice/multi tem pelo menos 2 opções', () => {
    QUESTIONNAIRE_SECTIONS.forEach(section => {
      section.fields.forEach(field => {
        if (field.type === 'choice' || field.type === 'multi') {
          expect((field.options ?? []).length).toBeGreaterThanOrEqual(2);
        }
      });
    });
  });
});
