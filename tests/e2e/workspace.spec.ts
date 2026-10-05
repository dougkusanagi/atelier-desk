import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import * as Y from 'yjs';
import { BoardDocument, createCard } from '../../packages/domain/src/index';
const password = 'SenhaDeTeste2026!';
async function register(page: Page) {
  const email = `studio-${crypto.randomUUID()}@example.test`;
  await page.goto('/cadastro');
  await page.getByLabel('Seu nome').fill('Estúdio de teste');
  await page.getByLabel('E-mail', { exact: true }).fill(email);
  await page.getByLabel('Senha', { exact: true }).fill(password);
  await page.locator('form button[type=submit], form button.primary-button').click();
  await expect(page).toHaveURL(/\/quadro\//);
  await expect(page.locator('.save-state')).toHaveText('Salvo');
  return email;
}
async function addNote(page: Page, text: string) {
  const count = await page.locator('[data-card-id]').count();
  await page.getByRole('button', { name: 'Nota', exact: true }).click();
  await expect(page.locator('[data-card-id]')).toHaveCount(count + 1);
  const note = page.locator('[data-card-id].selected');
  const id = await note.getAttribute('data-card-id');
  await note.locator('.tiptap').fill(text);
  await page.locator('.board-heading h1').click();
  await expect(page.locator('.save-state')).toHaveText('Salvo');
  return id!;
}
test('edita texto rico, desfaz, move e restaura o quadro após recarregar', async ({ page }) => {
  await register(page);
  const id = await addNote(page, 'Uma ideia que permanece.');
  const card = page.locator(`[data-card-id="${id}"]`);
  const box = await card.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + 30, box!.y + 12);
  await page.mouse.down();
  await page.mouse.move(box!.x + 190, box!.y + 112, { steps: 12 });
  await page.mouse.up();
  await expect(page.locator('.save-state')).toHaveText('Salvo');
  const position = await card.evaluate((el) => ({
    left: (el as HTMLElement).style.left,
    top: (el as HTMLElement).style.top,
  }));
  await page.reload();
  await expect(page.locator('.save-state')).toHaveText('Salvo');
  await expect(card.locator('.tiptap')).toContainText('Uma ideia que permanece.');
  await expect
    .poll(() =>
      card.evaluate((el) => ({
        left: (el as HTMLElement).style.left,
        top: (el as HTMLElement).style.top,
      })),
    )
    .toEqual(position);
});
test('duas sessões convergem e uma alteração pendente sobrevive à reconexão', async ({
  page,
  browser,
}) => {
  const email = await register(page);
  const url = page.url();
  const context = await browser.newContext();
  const other = await context.newPage();
  await other.goto('/entrar');
  await other.getByLabel('E-mail', { exact: true }).fill(email);
  await other.getByLabel('Senha', { exact: true }).fill(password);
  await other.locator('form button.primary-button').click();
  await expect(other).toHaveURL('http://127.0.0.1:5187/');
  await other.goto(url);
  await expect(other.locator('.save-state')).toHaveText('Salvo');
  const id = await addNote(page, 'Texto colaborativo.');
  await expect(other.locator(`[data-card-id="${id}"] .tiptap`)).toContainText(
    'Texto colaborativo.',
  );
  await page.context().route('**/api/v1/**', (route) => route.abort());
  await page.evaluate(() => window.dispatchEvent(new Event('offline')));
  // Close the actual websocket, not just the connectivity indicator.
  await page.context().setOffline(true);
  await page.locator(`[data-card-id="${id}"] .tiptap`).fill('Alteração guardada offline.');
  await expect(page.locator('.save-state')).toContainText('salvo neste dispositivo');
  await page.context().setOffline(false);
  await page.reload();
  await expect(page.locator(`[data-card-id="${id}"] .tiptap`)).toContainText(
    'Alteração guardada offline.',
  );
  await page.context().unroute('**/api/v1/**');
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(page.locator('.save-state')).toHaveText('Salvo');
  await expect(other.locator(`[data-card-id="${id}"] .tiptap`)).toContainText(
    'Alteração guardada offline.',
  );
  await context.close();
});
test('link público protegido exige senha e não oferece controles de edição', async ({
  page,
  browser,
}) => {
  await register(page);
  const boardId = page.url().split('/').at(-1);
  const session = await page.request.get('/api/v1/auth/me').then((r) => r.json());
  const link = await page.request
    .post(`/api/v1/boards/${boardId}/shares`, {
      headers: { 'X-CSRF-Token': session.csrfToken },
      data: { role: 'viewer', password: 'senha-do-quadro' },
    })
    .then((r) => r.json());
  const context = await browser.newContext();
  const publicPage = await context.newPage();
  await publicPage.goto('/compartilhar/' + link.token);
  await publicPage.getByLabel('Senha do quadro').fill('senha-do-quadro');
  await publicPage.getByRole('button', { name: 'Abrir quadro', exact: true }).click();
  await expect(publicPage.getByText('Somente leitura', { exact: true })).toBeVisible();
  await expect(publicPage.locator('.creation-toolbar')).toHaveCount(0);
  await expect(publicPage.locator('.tiptap[contenteditable=true]')).toHaveCount(0);
  await context.close();
});
test('modo linear funciona no celular e a tela de entrada atende aos critérios WCAG', async ({
  page,
}) => {
  await page.goto('/entrar');
  const scan = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  expect(scan.violations).toEqual([]);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await register(page);
  await expect(page.locator('.linear-board')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test('confirma e-mail pelo provedor local', async ({ page }) => {
  const email = await register(page);
  const directory = path.resolve('.data/e2e/mail');
  const files = await readdir(directory);
  let verification = '';
  for (const file of files) {
    const content = await readFile(path.join(directory, file), 'utf8');
    if (content.includes(email))
      verification =
        content.match(/http[^\s"<>]+\/verificar\?token=[^\s"<>]+/)?.[0] ?? verification;
  }
  expect(verification).not.toBe('');
  await page.goto(verification);
  await page.locator('form button.primary-button').click();
  await expect(page.getByText('E-mail confirmado.', { exact: true })).toBeVisible();
});

test('abre offline após recarregar o aplicativo de produção e recupera upload pendente', async ({
  page,
}) => {
  await register(page);
  await page.evaluate(() =>
    navigator.serviceWorker.ready.then(
      () =>
        new Promise<void>((resolve) => {
          if (navigator.serviceWorker.controller) resolve();
          else
            navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), {
              once: true,
            });
        }),
    ),
  );
  await page.context().setOffline(true);
  const picker = page.getByLabel('Adicionar arquivos', { exact: true });
  await picker.setInputFiles({
    name: 'referencia.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('Uma referência salva offline.'),
  });
  await expect(page.locator('.upload-queue')).toContainText('referencia.txt');
  await expect(page.locator('.save-state')).toContainText('salvo neste dispositivo');
  await page.reload();
  await expect(page.locator('.upload-queue')).toContainText('referencia.txt');
  await expect(page.locator('.save-state')).toContainText('salvo neste dispositivo');
  await page.context().setOffline(false);
  await expect(page.locator('.upload-queue')).toHaveCount(0);
  await expect(page.locator('.save-state')).toHaveText('Salvo');
  await expect(page.locator('.file-card')).toContainText('referencia.txt');
});

test('mantém culling e mede frames durante navegação com mil cartões', async ({ page }, info) => {
  await register(page);
  const boardId = page.url().split('/').at(-1),
    session = await page.request.get('/api/v1/auth/me').then((r) => r.json());
  const document = new BoardDocument();
  document.insert(
    Array.from({ length: 1000 }, (_, i) =>
      createCard(i % 5 === 0 ? 'color' : 'note', {
        x: (i % 25) * 320,
        y: Math.floor(i / 25) * 250,
      }),
    ),
  );
  const result = await page.request.post(`/api/v1/boards/${boardId}/commands`, {
    headers: { 'X-CSRF-Token': session.csrfToken },
    data: {
      update: Buffer.from(Y.encodeStateAsUpdate(document.doc)).toString('base64'),
      epoch: 1,
      updateId: crypto.randomUUID(),
    },
  });
  expect(result.ok()).toBe(true);
  document.destroy();
  await page.reload();
  await expect(page.locator('.save-state')).toHaveText('Salvo', { timeout: 30_000 });
  await expect(page.locator('[data-card-id]').first()).toBeVisible();
  const rendered = await page.locator('[data-card-id]').count();
  expect(rendered).toBeLessThan(100);
  const frames = await page.evaluate(async () => {
    await document.fonts.ready;
    const canvas = document.querySelector('.canvas')!,
      samples: number[] = [];
    let previous = performance.now();
    for (let i = 0; i < 120; i++) {
      await new Promise<void>((resolve) =>
        requestAnimationFrame((now) => {
          if (i > 10) samples.push(now - previous);
          previous = now;
          canvas.dispatchEvent(
            new WheelEvent('wheel', { deltaX: 8, deltaY: 3, bubbles: true, cancelable: true }),
          );
          resolve();
        }),
      );
    }
    return samples.sort((a, b) => a - b);
  });
  const report = {
    cards: 1007,
    rendered,
    viewport: page.viewportSize(),
    browser: 'Chromium headless',
    p50Ms: frames[Math.floor(frames.length * 0.5)],
    p95Ms: frames[Math.floor(frames.length * 0.95)],
  };
  await info.attach('desempenho-1000-cartoes', {
    body: JSON.stringify(report, null, 2),
    contentType: 'application/json',
  });
  console.log('Medição de navegação:', JSON.stringify(report));
  expect(report.p95Ms).toBeLessThan(34);
});

test('cria e edita conexões com curva e rótulo', async ({ page }) => {
  await register(page);
  const cards = page.locator('[data-card-id].card-note');
  await page.getByRole('button', { name: 'Conectar', exact: true }).click();
  const first = await cards.first().boundingBox(),
    second = await cards.nth(1).boundingBox();
  await page.mouse.click(first!.x + 15, first!.y + 12);
  await page.mouse.click(second!.x + 15, second!.y + 12);
  await page.getByLabel('Rótulo da conexão').fill('Inspiração para o projeto');
  await page.getByLabel('Traçado da conexão').selectOption('straight');
  await expect(page.locator('.connector-label')).toContainText('Inspiração para o projeto');
  await expect(page.locator('.save-state')).toHaveText('Salvo');
  await page.reload();
  await expect(page.locator('.connector-label')).toContainText('Inspiração para o projeto');
});

test('desfaz uma alteração pelo histórico durável após recarga', async ({ page }) => {
  await register(page);
  const id = await addNote(page, 'Uma ideia para desfazer depois.');
  await page.reload();
  await expect(page.locator('.save-state')).toHaveText('Salvo');
  await page.getByRole('button', { name: 'Histórico', exact: true }).click();
  const undo = page
    .getByRole('dialog')
    .getByRole('button', { name: 'Desfazer', exact: true })
    .first();
  await expect(undo).toBeEnabled();
  await undo.click();
  await expect(page.locator('.toast')).toContainText('Alteração desfeita');
  await page.getByRole('button', { name: 'Fechar', exact: true }).click();
  await expect(page.locator(`[data-card-id="${id}"] .tiptap`)).not.toContainText(
    'Uma ideia para desfazer depois.',
  );
});

test('reutiliza um template salvo e duplica o quadro pelo dashboard', async ({ page }) => {
  await register(page);
  await page.getByRole('button', { name: 'Nota', exact: true }).click();
  await page
    .locator('[data-card-id].card-note [contenteditable=true]')
    .last()
    .fill('Conteúdo do template pessoal');
  await expect(page.locator('.save-state')).toHaveText('Salvo');
  await page.getByRole('button', { name: 'Histórico', exact: true }).click();
  await page.getByRole('button', { name: 'Salvar como template' }).click();
  await expect(page.getByText('Template salvo', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Fechar', exact: true }).click();
  const title = await page.getByRole('textbox', { name: 'Nome do quadro' }).inputValue();
  await page.getByRole('link', { name: 'Meus quadros', exact: true }).first().click();
  await page.locator('.template-options').getByRole('button', { name: title }).click();
  await page.getByRole('textbox', { name: 'Nome do quadro' }).fill('Projeto a partir do template');
  await page.getByRole('button', { name: 'Criar quadro', exact: true }).click();
  await expect(page.locator('.card-note')).toContainText(['Conteúdo do template pessoal']);
  await page.getByRole('link', { name: 'Meus quadros', exact: true }).first().click();
  await page
    .getByRole('button', { name: 'Duplicar Projeto a partir do template', exact: true })
    .click();
  await expect(page.getByRole('textbox', { name: 'Nome do quadro' })).toHaveValue(
    'Projeto a partir do template — cópia',
  );
  await expect(page.locator('.card-note')).toContainText(['Conteúdo do template pessoal']);
});

test('mostra inserção em coluna e desagrupa filhos de coluna recolhida', async ({ page }) => {
  await register(page);
  const boardId = page.url().split('/quadro/')[1];
  const session = await (await page.request.get('/api/v1/auth/me')).json();
  const bootstrap = await (await page.request.get(`/api/v1/boards/${boardId}/bootstrap`)).json();
  const document = new BoardDocument();
  Y.applyUpdate(document.doc, Buffer.from(bootstrap.update, 'base64'));
  document.remove(document.snapshot().cards.map((card) => card.id));
  const columnId = document.add('column', { x: 570, y: 240 });
  const cardId = document.add('note', { x: 40, y: 280 });
  document.patch(cardId, { content: { text: 'Cartão para organizar' } });
  const response = await page.request.post(`/api/v1/boards/${boardId}/commands`, {
    headers: { 'X-CSRF-Token': session.csrfToken },
    data: {
      update: Buffer.from(Y.encodeStateAsUpdate(document.doc)).toString('base64'),
      epoch: 1,
      updateId: crypto.randomUUID(),
    },
  });
  expect(response.ok()).toBe(true);
  document.destroy();
  await page.reload();
  await expect(page.locator('.save-state')).toHaveText('Salvo');
  const card = page.locator(`[data-card-id="${cardId}"]`),
    column = page.locator(`[data-card-id="${columnId}"]`);
  const from = await card.boundingBox(),
    target = await column.boundingBox();
  await page.mouse.move(from!.x + 10, from!.y + 10);
  await page.mouse.down();
  await page.mouse.move(target!.x + 40, target!.y + 100, { steps: 12 });
  await expect(page.locator('.column-placeholder')).toBeVisible();
  await page.mouse.up();
  await expect.poll(async () => (await card.boundingBox())!.x).toBeCloseTo(target!.x + 16, 0);
  await column.getByRole('button', { name: 'Recolher coluna' }).click();
  await expect(card).not.toBeVisible();
  await column.click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('Delete');
  await expect(card).toBeVisible();
  await page.getByLabel('Desfazer', { exact: true }).click();
  await expect(card).not.toBeVisible();
});

test('recorta uma imagem e mantém prazo e responsável após recarga', async ({ page }) => {
  await register(page);
  const boardId = page.url().split('/quadro/')[1];
  await page.getByRole('button', { name: 'Imagem', exact: true }).click();
  await page
    .locator('input[type=file]')
    .first()
    .setInputFiles({
      name: 'referencia.png',
      mimeType: 'image/png',
      buffer: await readFile(path.resolve('tests/fixtures/referencia.png')),
    });
  const image = page.locator('.card-image');
  await expect(image.locator('img').first()).toBeVisible();
  await image.getByRole('button', { name: 'Ações do cartão' }).click();
  await page.getByRole('menuitem', { name: 'Recortar imagem' }).click();
  const width = page.getByRole('slider', { name: /Largura do recorte/ });
  await width.focus();
  await width.press('ArrowLeft');
  await page.getByRole('button', { name: 'Aplicar recorte' }).click();
  await expect(page.locator('.save-state')).toHaveText('Salvo');
  const session = await (await page.request.get('/api/v1/auth/me')).json();
  const task = page.locator('.card-tasks .task-details').first();
  await task.locator('summary').click();
  await task.getByLabel('Prazo da tarefa').fill('2026-11-20');
  await task.getByLabel('Responsável da tarefa', { exact: true }).selectOption(session.user.id);
  await expect(page.locator('.save-state')).toHaveText('Salvo');
  await page.reload();
  await expect(page.locator('.save-state')).toHaveText('Salvo');
  const bootstrap = await (await page.request.get(`/api/v1/boards/${boardId}/bootstrap`)).json(),
    document = new BoardDocument();
  Y.applyUpdate(document.doc, Buffer.from(bootstrap.update, 'base64'));
  expect(
    document.snapshot().cards.find((card) => card.type === 'image')?.content.crop?.width,
  ).toBeCloseTo(0.99, 2);
  const saved = document
    .snapshot()
    .cards.flatMap((card) => card.content.tasks ?? [])
    .find((task) => task.dueDate === '2026-11-20');
  expect(saved?.assignee).toBe(session.user.id);
  document.destroy();
});
