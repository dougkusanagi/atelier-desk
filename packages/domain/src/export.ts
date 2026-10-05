import type { BoardState, Card, RichNode } from './index';
const escape = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export function richHtml(nodes: RichNode[]): string {
  return nodes
    .map((node) => {
      if (node.kind === 'text')
        return node.delta
          .map((delta) => {
            let value = escape(delta.insert);
            const attrs = delta.attributes ?? {};
            for (const [mark, tag] of [
              ['bold', 'strong'],
              ['italic', 'em'],
              ['underline', 'u'],
              ['strike', 's'],
              ['code', 'code'],
            ])
              if (attrs[mark]) value = '<' + tag + '>' + value + '</' + tag + '>';
            const link = attrs.link as { href?: string } | undefined;
            if (link?.href && /^https?:\/\//i.test(link.href))
              value = '<a href="' + escape(link.href) + '">' + value + '</a>';
            return value;
          })
          .join('');
      const tag: Record<string, string> = {
        paragraph: 'p',
        heading: 'h' + Math.min(3, Math.max(1, Number(node.attributes.level) || 2)),
        blockquote: 'blockquote',
        bulletList: 'ul',
        orderedList: 'ol',
        listItem: 'li',
        codeBlock: 'pre',
        taskList: 'ul',
        taskItem: 'li',
        hardBreak: 'br',
      };
      const name = tag[node.name] ?? 'div';
      if (name === 'br') return '<br>';
      return '<' + name + '>' + richHtml(node.children) + '</' + name + '>';
    })
    .join('');
}
function markdownRich(nodes: RichNode[]): string {
  return nodes
    .map((node) => {
      if (node.kind === 'text')
        return node.delta
          .map((delta) => {
            let text = delta.insert;
            const attrs = delta.attributes ?? {};
            if (attrs.code) text = '`' + text + '`';
            if (attrs.bold) text = '**' + text + '**';
            if (attrs.italic) text = '*' + text + '*';
            if (attrs.strike) text = '~~' + text + '~~';
            const link = attrs.link as { href?: string } | undefined;
            if (link?.href && /^https?:\/\//i.test(link.href))
              text = '[' + text + '](' + link.href + ')';
            return text;
          })
          .join('');
      const text = markdownRich(node.children);
      if (node.name === 'heading')
        return (
          '#'.repeat(Math.min(3, Math.max(1, Number(node.attributes.level) || 2))) +
          ' ' +
          text.trim() +
          '\n\n'
        );
      if (node.name === 'paragraph') return text + '\n\n';
      if (node.name === 'blockquote')
        return (
          text
            .split('\n')
            .map((line) => '> ' + line)
            .join('\n') + '\n\n'
        );
      if (node.name === 'codeBlock') return '```\n' + text + '\n```\n\n';
      if (node.name === 'listItem') return '- ' + text.trim().replace(/\n/g, '\n  ') + '\n';
      if (node.name === 'taskItem')
        return '- [' + (node.attributes.checked ? 'x' : ' ') + '] ' + text.trim() + '\n';
      return text;
    })
    .join('');
}
export function boardMarkdown(
  state: BoardState,
  title: string,
  assetPath: (card: Card) => string = (c) =>
    c.content.assetId
      ? 'assets/' + c.content.assetId + '/' + (c.content.filename ?? 'arquivo')
      : (c.content.url ?? ''),
  options: {
    boardPath?: (card: Card) => string | undefined;
    drawingPath?: (card: Card) => string;
  } = {},
): string {
  const cardText = (card: Card): string => {
    const c = card.content;
    const heading = c.title ? '## ' + c.title + '\n\n' : '';
    if (card.type === 'note')
      return heading + (c.rich ? markdownRich(c.rich) : (c.text ?? '')) + '\n\n';
    if (card.type === 'tasks')
      return (
        heading +
        (c.tasks ?? [])
          .map(
            (t) =>
              '- [' + (t.done ? 'x' : ' ') + '] ' + t.text + (t.dueDate ? ' · ' + t.dueDate : ''),
          )
          .join('\n') +
        '\n\n'
      );
    if (card.type === 'color') return heading + (c.hex ?? '') + '\n\n';
    if (card.type === 'image')
      return (
        '![' +
        (c.alt ?? c.caption ?? c.filename ?? 'Imagem') +
        '](' +
        assetPath(card) +
        ')\n\n' +
        (c.caption ?? '') +
        '\n\n'
      );
    if (card.type === 'link')
      return '[' + (c.title ?? c.url) + '](' + c.url + ')\n\n' + (c.description ?? '') + '\n\n';
    if (card.type === 'board') {
      const path = options.boardPath
        ? options.boardPath(card)
        : c.boardId
          ? 'boards/' + c.boardId + '.md'
          : undefined;
      return heading + (path ? '[Abrir quadro](' + path + ')' : 'Quadro aninhado') + '\n\n';
    }
    if (card.type === 'drawing')
      return (
        heading +
        '[Desenho](' +
        (options.drawingPath?.(card) ?? 'drawings/' + card.id + '.svg') +
        ')\n\n'
      );
    return (
      heading +
      '[' +
      (c.filename ?? c.title ?? 'Mídia') +
      '](' +
      assetPath(card) +
      ')\n\n' +
      (c.caption ?? '') +
      '\n\n'
    );
  };
  const all = state.cards.filter((c) => !c.deletedAt),
    top = all
      .filter((c) => c.layout.kind === 'free')
      .sort((a, b) => a.y - b.y || a.x - b.x || a.id.localeCompare(b.id));
  let output = '# ' + title + '\n\n';
  for (const card of top) {
    if (card.type === 'column') {
      output += '## ' + (card.content.title ?? 'Coluna') + '\n\n';
      const children = all
        .filter((c) => c.layout.kind === 'column' && c.layout.columnId === card.id)
        .sort(
          (a, b) =>
            (a.layout.kind === 'column' ? a.layout.order : 0) -
              (b.layout.kind === 'column' ? b.layout.order : 0) || a.id.localeCompare(b.id),
        );
      output += children.map(cardText).join('');
    } else output += cardText(card);
  }
  const lines = state.connectors.filter((c) => !c.deletedAt);
  if (lines.length) {
    output += '## Relações\n\n';
    for (const line of lines) {
      const label = (end: typeof line.source) =>
        'cardId' in end
          ? (all.find((c) => c.id === end.cardId)?.content.title ?? end.cardId)
          : 'Ponto livre';
      output +=
        '- ' +
        label(line.source) +
        ' → ' +
        label(line.target) +
        (line.label ? ' — ' + line.label : '') +
        '\n';
    }
  }
  return output.trim() + '\n';
}
export function drawingSvg(card: Card): string {
  const paths = (card.content.strokes ?? [])
    .map(
      (s) =>
        '<path d="' +
        s.points.map((p, i) => (i ? 'L' : 'M') + p.x + ' ' + p.y).join(' ') +
        '" stroke="' +
        escape(s.color) +
        '" stroke-width="' +
        s.width +
        '" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
    )
    .join('');
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" width="' +
    card.width +
    '" height="' +
    card.height +
    '" viewBox="0 0 ' +
    card.width +
    ' ' +
    card.height +
    '">' +
    paths +
    '</svg>'
  );
}
