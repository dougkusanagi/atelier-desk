export type CardType =
  'note' | 'tasks' | 'image' | 'link' | 'file' | 'media' | 'color' | 'column' | 'board' | 'drawing';
export type Point = { x: number; y: number };
export type Rect = Point & { width: number; height: number };
export type Camera = { x: number; y: number; zoom: number };
export type Layout = { kind: 'free' } | { kind: 'column'; columnId: string; order: number };
export type Task = {
  id: string;
  text: string;
  done: boolean;
  order: number;
  assignee?: string;
  dueDate?: string;
};
export type Stroke = {
  id: string;
  color: string;
  width: number;
  points: Array<Point & { pressure?: number }>;
};
export type CardContent = {
  text?: string;
  title?: string;
  caption?: string;
  alt?: string;
  url?: string;
  description?: string;
  thumbnail?: string;
  favicon?: string;
  assetId?: string;
  filename?: string;
  mime?: string;
  bytes?: number;
  hex?: string;
  boardId?: string;
  owned?: boolean;
  collapsed?: boolean;
  tasks?: Task[];
  strokes?: Stroke[];
  mediaKind?: 'audio' | 'video';
  uploadState?: 'pending' | 'uploading' | 'processing' | 'ready' | 'failed';
  crop?: { x: number; y: number; width: number; height: number };
};
export type Card = Rect & {
  id: string;
  type: CardType;
  z: number;
  color: string;
  layout: Layout;
  content: CardContent;
  deletedAt?: string;
};
export type Endpoint = { cardId: string; side: 'top' | 'right' | 'bottom' | 'left' } | Point;
export type Connector = {
  id: string;
  source: Endpoint;
  target: Endpoint;
  label: string;
  curved: boolean;
  controls?: [Point, Point];
  color: string;
  width: number;
  dashed: boolean;
  arrows: 'none' | 'end' | 'both';
  deletedAt?: string;
};
export type BoardState = { cards: Card[]; connectors: Connector[]; revision: number };
export const CARD_LABELS: Record<CardType, string> = {
  note: 'Nota',
  tasks: 'Tarefas',
  image: 'Imagem',
  link: 'Link',
  file: 'Arquivo',
  media: 'Vídeo ou áudio',
  color: 'Cor',
  column: 'Coluna',
  board: 'Quadro',
  drawing: 'Desenho',
};
export const CARD_COLORS = [
  '#FFFFFF',
  '#FFF4CC',
  '#FFE4CF',
  '#FBE0E5',
  '#ECE3FA',
  '#DEEAFB',
  '#DEEFE6',
  '#E8EAED',
];
export const id = (): string => crypto.randomUUID();
export function createCard(type: CardType, point: Point): Card {
  const content: CardContent =
    type === 'tasks'
      ? { title: 'Lista de tarefas', tasks: [{ id: id(), text: '', done: false, order: 0 }] }
      : type === 'color'
        ? { hex: '#D3BFA7', title: 'Nova cor' }
        : type === 'column'
          ? { title: 'Nova coluna' }
          : type === 'board'
            ? { title: 'Novo quadro', owned: true }
            : type === 'drawing'
              ? { strokes: [] }
              : {
                  text: '',
                  title: type === 'note' ? undefined : 'Novo ' + CARD_LABELS[type].toLowerCase(),
                };
  return {
    id: id(),
    type,
    x: point.x,
    y: point.y,
    width: type === 'color' ? 160 : type === 'column' ? 320 : 280,
    height: type === 'color' ? 160 : type === 'column' ? 320 : type === 'drawing' ? 240 : 180,
    z: Date.now(),
    color: '#FFFFFF',
    layout: { kind: 'free' },
    content,
  };
}
