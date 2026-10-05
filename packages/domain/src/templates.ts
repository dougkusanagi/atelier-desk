import { createCard, id, type Card, type BoardState } from './types';
export const BUILTIN_TEMPLATES = [
  {
    id: 'moodboard',
    name: 'Moodboard',
    category: 'Inspiração',
    description: 'Referências, paleta e direção visual.',
  },
  {
    id: 'storyboard',
    name: 'Storyboard',
    category: 'Narrativa',
    description: 'Organize cenas e desenvolva sua história.',
  },
  {
    id: 'project',
    name: 'Plano de projeto',
    category: 'Planejamento',
    description: 'Do objetivo à entrega, com próximos passos claros.',
  },
  {
    id: 'brief',
    name: 'Briefing criativo',
    category: 'Planejamento',
    description: 'Alinhe contexto, público, mensagem e entregas.',
  },
  {
    id: 'research',
    name: 'Pesquisa visual',
    category: 'Pesquisa',
    description: 'Reúna fontes, observações e descobertas.',
  },
  {
    id: 'weekly',
    name: 'Planejamento semanal',
    category: 'Planejamento',
    description: 'Uma semana com prioridades e espaço para criar.',
  },
];
export function templateState(templateId: string): BoardState {
  const cards: Card[] = [];
  const note = (title: string, text: string, x: number, y: number, color = '#FFFFFF') => {
    const c = createCard('note', { x, y });
    c.content = { title, text };
    c.width = 300;
    c.height = 220;
    c.color = color;
    cards.push(c);
    return c;
  };
  const column = (title: string, x: number, items: string[]) => {
    const col = createCard('column', { x, y: 0 });
    col.content = { title };
    col.height = 500;
    cards.push(col);
    items.forEach((text, i) => {
      const n = note(text, 'Registre aqui suas ideias e referências.', 0, 0);
      n.height = 150;
      n.layout = { kind: 'column', columnId: col.id, order: i };
    });
  };
  if (templateId === 'moodboard') {
    note(
      'Uma ideia começa aqui',
      'Campanha de primavera\n\nUma coleção sobre pausas, luz natural e os pequenos detalhes do cotidiano.\n\nOrganize suas referências. Faça conexões. Deixe as ideias respirarem.',
      0,
      0,
    );
    const tasks = createCard('tasks', { x: 340, y: 0 });
    tasks.height = 250;
    tasks.content = {
      title: 'Próximos passos',
      tasks: [
        'Definir a direção criativa',
        'Reunir referências visuais',
        'Explorar a paleta',
        'Compartilhar com a equipe',
      ].map((text, i) => ({ id: id(), text, done: i === 0, order: i })),
    };
    cards.push(tasks);
    note(
      'Direção visual',
      'Luz e textura\nSombras suaves e superfícies orgânicas.\n\nComposição\nEspaço para respirar. Ritmo sem rigidez.\n\nTom de voz\nPróximo, simples e intencional.',
      660,
      0,
    );
    note(
      'O que queremos transmitir?',
      'Menos ruído. Mais presença.\nMateriais naturais, gestos espontâneos e uma perspectiva acolhedora.',
      0,
      278,
      '#FFF4CC',
    );
    [
      ['Areia', '#D3BFA7'],
      ['Sálvia', '#A8B6A0'],
      ['Terracota', '#B57155'],
    ].forEach(([title, hex], i) => {
      const c = createCard('color', { x: 340 + i * 184, y: 294 });
      c.content = { title, hex };
      cards.push(c);
    });
  } else if (templateId === 'storyboard') {
    ['Abertura', 'Desenvolvimento', 'Desfecho'].forEach((title, i) =>
      column(title, i * 360, ['Cena ' + (i * 2 + 1), 'Cena ' + (i * 2 + 2)]),
    );
  } else if (templateId === 'project') {
    note(
      'Objetivo do projeto',
      'O que queremos transformar?\n\nDefina um resultado claro e como medir o sucesso.',
      0,
      0,
      '#FFF4CC',
    );
    ['A fazer', 'Em andamento', 'Concluído'].forEach((title, i) =>
      column(title, 340 + i * 360, ['Entrega ' + (i + 1)]),
    );
  } else if (templateId === 'brief') {
    [
      'Contexto',
      'Público',
      'Mensagem principal',
      'Tom e referências',
      'Entregas',
      'Restrições',
    ].forEach((title, i) =>
      note(
        title,
        'Descreva ' + title.toLowerCase() + ' do projeto.',
        (i % 3) * 340,
        Math.floor(i / 3) * 260,
      ),
    );
  } else if (templateId === 'research') {
    ['Fontes', 'Observações', 'Descobertas'].forEach((title, i) =>
      column(title, i * 360, ['Primeira referência']),
    );
  } else {
    ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta'].forEach((title, i) => {
      const c = createCard('tasks', { x: i * 310, y: 0 });
      c.content = {
        title,
        tasks: [{ id: id(), text: 'Prioridade do dia', done: false, order: 0 }],
      };
      cards.push(c);
    });
  }
  return { cards, connectors: [], revision: 0 };
}
