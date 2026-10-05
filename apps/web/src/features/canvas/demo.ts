import { BoardDocument, createCard } from '@atelier/domain';
export function demoBoard() {
  const board = new BoardDocument();
  const brief = createCard('note', { x: 0, y: 0 });
  brief.width = 300;
  brief.height = 220;
  brief.content = {
    title: 'Uma ideia começa aqui',
    text: 'Campanha de primavera\n\nUma coleção sobre pausas, luz natural e os pequenos detalhes do cotidiano.\n\nOrganize suas referências. Faça conexões. Deixe as ideias respirarem.',
  };
  const tasks = createCard('tasks', { x: 340, y: 0 });
  tasks.height = 240;
  tasks.content = {
    title: 'Próximos passos',
    tasks: [
      { id: crypto.randomUUID(), text: 'Definir a direção criativa', done: true, order: 0 },
      { id: crypto.randomUUID(), text: 'Reunir referências visuais', done: false, order: 1 },
      { id: crypto.randomUUID(), text: 'Explorar a paleta', done: false, order: 2 },
      { id: crypto.randomUUID(), text: 'Compartilhar com a equipe', done: false, order: 3 },
    ],
  };
  const note = createCard('note', { x: 0, y: 258 });
  note.color = '#FFF4CC';
  note.height = 150;
  note.width = 300;
  note.content = {
    title: 'O que queremos transmitir?',
    text: 'Menos ruído. Mais presença.\nMateriais naturais, gestos espontâneos e uma perspectiva acolhedora.',
  };
  const a = createCard('color', { x: 340, y: 278 });
  a.content = { title: 'Areia', hex: '#D3BFA7' };
  const b = createCard('color', { x: 524, y: 278 });
  b.content = { title: 'Sálvia', hex: '#A8B6A0' };
  const c = createCard('color', { x: 708, y: 278 });
  c.content = { title: 'Terracota', hex: '#B57155' };
  const direction = createCard('note', { x: 660, y: 0 });
  direction.width = 300;
  direction.height = 240;
  direction.content = {
    title: 'Direção visual',
    text: '01 / Luz e textura\nSombras suaves e superfícies orgânicas.\n\n02 / Composição\nEspaço para respirar. Ritmo sem rigidez.\n\n03 / Tom de voz\nPróximo, simples e intencional.',
  };
  board.insert([brief, tasks, note, a, b, c, direction]);
  board.undoManager.clear();
  return board;
}
