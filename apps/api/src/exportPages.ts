import type { Page } from 'playwright';
import JSZip from 'jszip';
import { ApiError } from './security';
export async function tiledPng(
  page: Page,
  width: number,
  height: number,
  scale: number,
  transparent: boolean,
  progress: (done: number, total: number) => Promise<void>,
) {
  const size = 4096 / scale,
    cols = Math.ceil(width / size),
    rows = Math.ceil(height / size);
  if (cols * rows > 256)
    throw new ApiError(
      413,
      'EXPORT_TOO_LARGE',
      'O quadro excede 256 blocos. Exporte uma seleção menor.',
    );
  const zip = new JSZip(),
    tiles: Array<{ file: string; x: number; y: number; width: number; height: number }> = [];
  for (let row = 0; row < rows; row++)
    for (let col = 0; col < cols; col++) {
      const clip = {
        x: col * size,
        y: row * size,
        width: Math.min(size, width - col * size),
        height: Math.min(size, height - row * size),
      };
      const file = `bloco-${row + 1}-${col + 1}.png`;
      await progress(tiles.length, cols * rows);
      await page.setViewportSize({ width: clip.width, height: clip.height });
      await page.evaluate(({ x, y }) => {
        document.querySelector<HTMLElement>('.board')!.style.transform =
          `translate(${-x}px, ${-y}px)`;
      }, clip);
      zip.file(file, await page.screenshot({ type: 'png', omitBackground: transparent }));
      tiles.push({ file, ...clip });
    }
  zip.file(
    'manifesto.json',
    JSON.stringify(
      {
        width,
        height,
        scale,
        coordinateSystem: 'pixels CSS; multiplique por scale para obter pixels da imagem',
        tiles,
      },
      null,
      2,
    ),
  );
  return zip.generateAsync({ type: 'nodebuffer', compression: 'STORE' });
}
export async function paginatedPdf(page: Page, width: number, height: number, title: string) {
  const tileWidth = 1122,
    tileHeight = 751,
    cols = Math.ceil(width / tileWidth),
    rows = Math.ceil(height / tileHeight);
  if (cols * rows > 256)
    throw new ApiError(
      413,
      'EXPORT_TOO_LARGE',
      'O quadro excede 256 páginas A4. Exporte uma seleção menor.',
    );
  await page.evaluate(
    ({ width, height, title, tileWidth, tileHeight, cols, rows }) => {
      const board = document.querySelector<HTMLElement>('.board')!;
      const cardRects = [...board.querySelectorAll<HTMLElement>('article.card')].map((card) => ({
        x: parseFloat(card.style.left),
        y: parseFloat(card.style.top),
        width: card.offsetWidth,
        height: card.offsetHeight,
      }));
      const fragments = document.createDocumentFragment();
      for (let row = 0; row < rows; row++)
        for (let col = 0; col < cols; col++) {
          const section = document.createElement('section');
          section.className = 'print-page';
          const heading = document.createElement('header');
          heading.className = 'print-heading';
          heading.textContent = `${title} · ${row * cols + col + 1}/${rows * cols}`;
          section.append(heading);
          const clone = board.cloneNode(true) as HTMLElement;
          clone.style.position = 'absolute';
          clone.style.left = -col * tileWidth + 'px';
          clone.style.top = -row * tileHeight + 'px';
          clone.style.width = width + 'px';
          clone.style.height = height + 'px';
          [...clone.querySelectorAll('article.card')].forEach((card, i) => {
            const rect = cardRects[i];
            if (
              rect.x > (col + 1) * tileWidth ||
              rect.x + rect.width < col * tileWidth ||
              rect.y > (row + 1) * tileHeight ||
              rect.y + rect.height < row * tileHeight
            )
              card.remove();
          });
          const viewport = document.createElement('div');
          Object.assign(viewport.style, {
            position: 'absolute',
            top: '42px',
            left: '0',
            width: tileWidth + 'px',
            height: tileHeight + 'px',
            overflow: 'hidden',
          });
          viewport.append(clone);
          section.append(viewport);
          fragments.append(section);
        }
      document.body.replaceChildren(fragments);
      const style = document.createElement('style');
      style.textContent =
        '@page{size:A4 landscape;margin:0}.print-page{position:relative;width:1122px;height:793px;overflow:hidden;break-after:page}.print-page:last-child{break-after:auto}.print-heading{position:absolute;left:24px;right:24px;top:0;height:42px;display:flex;align-items:center;font-size:11px;background:inherit;z-index:100000;white-space:nowrap;overflow:hidden}.print-page .board{clip-path:inset(0)}';
      document.head.append(style);
    },
    { width, height, title, tileWidth, tileHeight, cols, rows },
  );
  return page.pdf({
    format: 'A4',
    landscape: true,
    preferCSSPageSize: true,
    printBackground: true,
    tagged: true,
    margin: { top: 0, right: 0, bottom: 0, left: 0 },
  });
}
