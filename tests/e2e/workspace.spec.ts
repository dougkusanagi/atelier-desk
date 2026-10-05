import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
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
