/**
 * Ficha de Visita e Diagnóstico JSETRA — mesmas perguntas do artefacto
 * "Diagnóstico JSETRA" usado nas visitas presenciais, mas pensadas para o
 * próprio destinatário preencher sozinho a partir de um link (ver
 * QuestionnairePage). Fonte única do esquema de perguntas: tanto a página
 * pública de preenchimento como a vista de leitura no SuperAdmin importam
 * daqui, para nunca divergirem.
 */

export type QuestionType = 'text' | 'textarea' | 'choice' | 'multi';

export interface QuestionnaireField {
  key: string;
  /** Pergunta a mostrar tal como se diria em voz alta — usa itálico em citação. */
  prompt?: string;
  /** Rótulo curto (em vez de `prompt`) para campos que não são uma pergunta directa. */
  label?: string;
  type: QuestionType;
  placeholder?: string;
  options?: string[];
  /** Só mostra este campo se outro campo tiver um valor/opção específico. */
  showIf?: { key: string; equals?: string; includes?: string };
  /** Destaca visualmente (usado na pergunta-chave da secção de Gestão). */
  highlight?: boolean;
}

export interface QuestionnaireSection {
  id: string;
  num: string;
  title: string;
  fields: QuestionnaireField[];
}

export const QUESTIONNAIRE_SECTIONS: QuestionnaireSection[] = [
  {
    id: 'perfil', num: '01', title: 'Perfil do estabelecimento', fields: [
      { key: 'tipo', label: 'Tipo', type: 'choice', options: ['Restaurante', 'Bar', 'Café', 'Takeaway', 'Restaurante + Bar', 'Outro'] },
      { key: 'tipoOutro', type: 'text', placeholder: 'Especifique o tipo', showIf: { key: 'tipo', equals: 'Outro' } },
      { key: 'numMesas', label: 'Número de mesas', type: 'text', placeholder: 'ex: 12' },
      { key: 'numFuncionarios', label: 'Número aproximado de funcionários', type: 'text', placeholder: 'ex: 8' },
      { key: 'horario', label: 'Horário de funcionamento', type: 'text', placeholder: 'ex: 11h – 22h' },
      { key: 'multiUnidade', label: 'Possui mais de uma unidade?', type: 'choice', options: ['Sim', 'Não'] },
      { key: 'decisor', label: 'Responsável pela decisão', type: 'choice', options: ['Proprietário', 'Gerente', 'Administrador', 'Outro'] },
      { key: 'decisorOutro', type: 'text', placeholder: 'Especifique', showIf: { key: 'decisor', equals: 'Outro' } },
    ],
  },
  {
    id: 'pedidos', num: '02', title: 'Pedidos', fields: [
      { key: 'pedidosComo', prompt: 'Como o pedido do cliente é feito atualmente?', type: 'multi', options: ['Papel', 'WhatsApp', 'Telefone', 'Verbalmente', 'Sistema', 'Outro'] },
      { key: 'pedidosComoOutro', type: 'text', placeholder: 'Especifique', showIf: { key: 'pedidosComo', includes: 'Outro' } },
      { key: 'pedidosChegaCozinha', prompt: 'Quando o pedido é feito, como ele chega até à cozinha?', type: 'textarea' },
      { key: 'pedidosPerdidos', prompt: 'Acontece às vezes de um pedido ser perdido, esquecido ou chegar errado à cozinha?', type: 'choice', options: ['Sim', 'Não'] },
      { key: 'pedidosFrequencia', label: 'Com que frequência aproximadamente?', type: 'text', showIf: { key: 'pedidosPerdidos', equals: 'Sim' } },
    ],
  },
  {
    id: 'caixa', num: '03', title: 'Caixa e Vendas', fields: [
      { key: 'caixaControlam', prompt: 'Como vocês controlam as vendas durante o dia?', type: 'textarea' },
      { key: 'caixaFecham', prompt: 'No final do dia, como fazem o fecho?', type: 'textarea' },
      { key: 'caixaConsultaFacil', prompt: 'O proprietário consegue consultar facilmente quanto foi vendido?', type: 'choice', options: ['Sim', 'Não'] },
      { key: 'caixaConsultaRemoto', prompt: 'Consegue saber isso sem estar fisicamente no restaurante?', type: 'choice', options: ['Sim', 'Não'] },
    ],
  },
  {
    id: 'estoque', num: '04', title: 'Estoque', fields: [
      { key: 'estoqueControlam', prompt: 'Como vocês controlam atualmente o estoque?', type: 'textarea' },
      { key: 'estoquePercebem', prompt: 'Quando um ingrediente está a acabar, como vocês percebem?', type: 'textarea' },
      { key: 'estoqueFaltou', prompt: 'Já aconteceu de um cliente pedir algo e descobrirem que o produto ou ingrediente acabou?', type: 'choice', options: ['Sim', 'Não'] },
      { key: 'estoqueFrequencia', label: 'Isso acontece com frequência?', type: 'text', showIf: { key: 'estoqueFaltou', equals: 'Sim' } },
    ],
  },
  {
    id: 'gestao', num: '05', title: 'Gestão do restaurante', fields: [
      { key: 'gestaoAcompanha', prompt: 'Se não vier ao restaurante amanhã, como consegue acompanhar o que aconteceu durante o dia?', type: 'textarea' },
      { key: 'gestaoSabe', prompt: 'Consegue saber quanto vendeu, quais produtos venderam mais e quanto gastou?', type: 'choice', options: ['Sim', 'Parcialmente', 'Não'] },
      { key: 'gestaoDificuldade', prompt: 'Hoje, qual é a maior dificuldade que tem para controlar o restaurante?', type: 'textarea', highlight: true },
    ],
  },
  {
    id: 'clientes', num: '06', title: 'Clientes', fields: [
      { key: 'clientesHistorico', prompt: 'Consegue guardar o histórico dos clientes?', type: 'choice', options: ['Sim', 'Não'] },
      { key: 'clientesFrequentes', prompt: 'Sabe quais clientes compram com mais frequência?', type: 'choice', options: ['Sim', 'Não'] },
      { key: 'clientesFidelizacao', prompt: 'Faz algum programa de fidelização ou promoções para clientes?', type: 'choice', options: ['Sim', 'Não'] },
    ],
  },
  {
    id: 'sistema', num: '07', title: 'Sistema atual', fields: [
      { key: 'sistemaUsa', prompt: 'Utiliza algum sistema de gestão atualmente?', type: 'choice', options: ['Sim', 'Não'] },
      { key: 'sistemaQual', label: 'Qual?', type: 'text', showIf: { key: 'sistemaUsa', equals: 'Sim' } },
      { key: 'sistemaGosta', prompt: 'O que mais gosta no sistema que utiliza?', type: 'textarea', showIf: { key: 'sistemaUsa', equals: 'Sim' } },
      { key: 'sistemaGostaria', prompt: 'O que gostaria que ele fizesse e atualmente não faz?', type: 'textarea', showIf: { key: 'sistemaUsa', equals: 'Sim' } },
    ],
  },
  {
    id: 'diagnostico', num: '08', title: 'Diagnóstico', fields: [
      { key: 'diagnosticoProblema', prompt: 'Na sua opinião, qual é o maior desafio na gestão do seu restaurante hoje?', type: 'textarea', highlight: true },
    ],
  },
  {
    id: 'fechamento', num: '09', title: 'Para terminar', fields: [
      { key: 'posMaisUtil', prompt: 'O que, numa ferramenta de gestão, seria mais útil para o seu restaurante?', type: 'textarea' },
      { key: 'posDisposto', prompt: 'Estaria disposto a experimentar uma plataforma como a JSETRA no seu restaurante, durante um período inicial?', type: 'choice', options: ['Sim', 'Talvez', 'Não'] },
      { key: 'posUltimaPergunta', prompt: 'Existe mais alguma coisa na gestão do restaurante que gostaria que um sistema pudesse resolver?', type: 'textarea' },
    ],
  },
];

export type QuestionnaireAnswers = Record<string, string | string[]>;

export function emptyQuestionnaireAnswers(): QuestionnaireAnswers {
  const answers: QuestionnaireAnswers = {};
  QUESTIONNAIRE_SECTIONS.forEach(section => {
    section.fields.forEach(field => {
      answers[field.key] = field.type === 'multi' ? [] : '';
    });
  });
  return answers;
}

export function isFieldVisible(field: QuestionnaireField, answers: QuestionnaireAnswers): boolean {
  if (!field.showIf) return true;
  const value = answers[field.showIf.key];
  if (field.showIf.includes) return Array.isArray(value) && value.includes(field.showIf.includes);
  return value === field.showIf.equals;
}
