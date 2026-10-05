import { describe, expect, it } from 'vitest';
import { boardMarkdown, richHtml } from './export';
import { templateState } from './templates';
describe('exportação de conteúdo', () => {
  it('preserva tarefas, paleta e organização em Markdown', () => {
    const result = boardMarkdown(templateState('moodboard'), 'Direção criativa');
    expect(result).toContain('# Direção criativa');
    expect(result).toContain('- [x] Definir a direção criativa');
    expect(result).toContain('#D3BFA7');
  });
  it('escapa HTML e bloqueia links executáveis no renderizador', () => {
    const result = richHtml([
      {
        kind: 'element',
        name: 'paragraph',
        attributes: {},
        children: [
          {
            kind: 'text',
            delta: [
              {
                insert: '<script>teste</script>',
                attributes: { bold: true, link: { href: 'javascript:alert(1)' } },
              },
            ],
          },
        ],
      },
    ]);
    expect(result).toContain('&lt;script&gt;');
    expect(result).not.toContain('javascript:');
    expect(result).toContain('<strong>');
  });
});
