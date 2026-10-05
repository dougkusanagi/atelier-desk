import * as Y from 'yjs';
export type RichNode =
  | { kind: 'element'; name: string; attributes: Record<string, string>; children: RichNode[] }
  | { kind: 'text'; delta: Array<{ insert: string; attributes?: Record<string, unknown> }> };
export function richNodes(fragment: Y.XmlFragment): RichNode[] {
  return fragment.toArray().flatMap((node): RichNode[] => {
    if (node instanceof Y.XmlElement)
      return [
        {
          kind: 'element' as const,
          name: node.nodeName,
          attributes: Object.fromEntries(
            Object.entries(node.getAttributes()).filter(([, v]) => v !== undefined),
          ) as Record<string, string>,
          children: richNodes(node),
        },
      ];
    if (node instanceof Y.XmlText)
      return [
        {
          kind: 'text' as const,
          delta: node
            .toDelta()
            .filter((item: { insert?: unknown }) => typeof item.insert === 'string'),
        },
      ];
    return [];
  });
}
export function writeRich(fragment: Y.XmlFragment, nodes: RichNode[]) {
  const build = (node: RichNode): Y.XmlElement | Y.XmlText => {
    if (node.kind === 'text') {
      const text = new Y.XmlText();
      text.applyDelta(node.delta);
      return text;
    }
    const element = new Y.XmlElement(node.name);
    Object.entries(node.attributes).forEach(([key, value]) => element.setAttribute(key, value));
    element.insert(0, node.children.map(build));
    return element;
  };
  if (fragment.length) fragment.delete(0, fragment.length);
  fragment.insert(0, nodes.map(build));
}
export function plainRich(nodes: RichNode[]): string {
  return nodes
    .map((node) =>
      node.kind === 'text'
        ? node.delta.map((d) => d.insert).join('')
        : plainRich(node.children) +
          (node.name === 'paragraph' || node.name === 'heading' ? '\n' : ''),
    )
    .join('')
    .trimEnd();
}
export function textNodes(text: string): RichNode[] {
  return text
    .split('\n')
    .map((line) => ({
      kind: 'element',
      name: 'paragraph',
      attributes: {},
      children: line ? [{ kind: 'text', delta: [{ insert: line }] }] : [],
    }));
}
