import { expect, test } from '@playwright/test';
import { resolve } from 'node:path';

test.use({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });

async function start(page, className = 'Warden') {
  await page.getByRole('button', { name: 'Begin journey' }).click();
  await page.getByRole('button', { name: new RegExp(className) }).click();
  await page.getByRole('button', { name: 'Enter Gloamwatch' }).click();
  await expect(page.getByRole('heading', { name: 'Gloamwatch' })).toBeVisible();
}

test('desktop controls, quest progression, and persisted chapter state', async ({ page }) => {
  test.setTimeout(80_000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await page.getByRole('button', { name: 'Sound on' }).click();
  await expect(page.getByRole('button', { name: 'Sound off' })).toHaveAttribute('aria-pressed', 'false');
  await page.getByRole('button', { name: 'How to play' }).click();
  await expect(page.getByRole('dialog')).toContainText('Click an enemy');
  await page.keyboard.press('Escape');
  await start(page, 'Ember Witch');
  expect(await page.locator('#world').evaluate(canvas => Boolean(canvas.getContext('webgl2')))).toBe(true);

  // Mara stands three tiles north of the starting point. Click her visible sprite.
  await page.mouse.click(865, 335);
  await expect(page.locator('#quest-objective')).toHaveText('Recover the Ash Seal', { timeout: 14_000 });
  await page.keyboard.press('j');
  await expect(page.getByRole('dialog')).toContainText('A road of cinders');
  await page.keyboard.press('j');

  // Take the right-hand road toward the gate, then click its newly visible arch.
  await page.mouse.click(1270, 495);
  await expect.poll(() => page.evaluate(() =>
    JSON.parse(localStorage.getItem('ash-and-iron.v1')).position[0]), { timeout: 14_000 }).toBeGreaterThan(15);
  const gate = await page.evaluate(() => {
    const [x, y] = JSON.parse(localStorage.getItem('ash-and-iron.v1')).position;
    return [720 + ((21 - x) - (7 - y)) * 49, 432 + ((21 - x) + (7 - y)) * 49 * 0.52 - 31];
  });
  await page.mouse.click(...gate);
  await expect(page.getByRole('heading', { name: 'Cinderwood' })).toBeVisible({ timeout: 14_000 });

  // Cast toward the first patrol and open the inventory to pause the game.
  await page.mouse.move(905, 490);
  await page.getByRole('button', { name: 'Class skill' }).click();
  await page.keyboard.press('i');
  await expect(page.getByRole('dialog')).toContainText('Equipped');
  expect(Number(await page.locator('#spirit-value').innerText())).toBeLessThan(90);
  await page.keyboard.press('i');

  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Save & return to title' }).click();
  await page.reload();
  await expect(page.locator('#save-label')).toContainText('Ember Witch · Cinderwood');
  await page.getByRole('button', { name: 'Continue journey' }).click();
  await expect(page.getByRole('heading', { name: 'Cinderwood' })).toBeVisible();
  await expect(page.locator('#quest-objective')).toHaveText('Recover the Ash Seal');
  expect(errors).toEqual([]);
});

test('downloadable HTML runs offline and works with the touch interface', async ({ browser }) => {
  test.setTimeout(45_000);
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, offline: true });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const file = 'https://local-game.test/Ash-and-Iron.html';
  await context.route('**/*', route => route.request().url() === file
    ? route.fulfill({ path: resolve('dist/Ash-and-Iron.html'), contentType: 'text/html' })
    : route.abort());
  await page.goto(file);
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => document.fonts.check('700 28px Cinzel'))).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await start(page, 'Hollow Scout');
  await page.locator('#world').tap({ position: { x: 288, y: 331 } });
  await expect(page.locator('#quest-objective')).toHaveText('Recover the Ash Seal', { timeout: 14_000 });
  await page.getByRole('button', { name: 'Inventory' }).tap();
  await expect(page.getByRole('dialog')).toContainText('Your pack is empty.');
  await page.getByRole('button', { name: 'Close dialog' }).tap();
  await expect(page.locator('#level-label')).toContainText('Hollow Scout');
  expect(errors).toEqual([]);
  await context.close();
});

test('the 3D Belfry fight triggers the finale and saves completion', async ({ page }) => {
  test.setTimeout(100_000);
  const { Game, SAVE_KEY } = await import('../src/game.js');
  const { makeItem } = await import('../src/content.js');
  const checkpoint = new Game('witch');
  checkpoint.state.stage = 3;
  checkpoint.state.level = 7;
  checkpoint.state.traits = { vigor: 3, might: 5, focus: 2 };
  checkpoint.state.gear = {
    armor: makeItem('armor', 2, 7, 1),
    weapon: makeItem('weapon', 2, 7, 2),
  };
  checkpoint.state.nextItem = 3;
  checkpoint.state.draughts = 9;
  checkpoint.state.defeated.belfry = [0, 1, 2, 3, 4, 5];
  checkpoint.enter('belfry', [16, 12]);
  checkpoint.player.hp = checkpoint.maxHP;
  await page.addInitScript(({ key, save }) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(save));
  }, { key: SAVE_KEY, save: checkpoint.snapshot() });

  await page.goto('/');
  await page.getByRole('button', { name: 'Sound on' }).click();
  await page.getByRole('button', { name: 'Continue journey' }).click();
  await expect(page.getByRole('heading', { name: 'Ashen Belfry' })).toBeVisible();
  await expect(page.locator('#boss-bar')).toBeVisible({ timeout: 20_000 });
  const boss = [965, 455];
  await page.mouse.click(...boss);
  await expect.poll(async () => page.locator('#boss-hp').evaluate(bar => bar.value), { timeout: 15_000 }).toBeLessThan(740);
  for (let i = 0; i < 12; i++) {
    if (await page.locator('#boss-bar').isHidden()) break;
    await page.keyboard.press('q');
    await page.keyboard.press('r');
    await page.waitForTimeout(650);
  }
  await expect(page.locator('#quest-objective')).toHaveText('Return to Keeper Mara', { timeout: 15_000 });

  // The waygate is four tiles south of the bell, within view of the player.
  await page.mouse.click(768, 628);
  await expect(page.getByRole('heading', { name: 'Gloamwatch' })).toBeVisible({ timeout: 18_000 });
  await page.mouse.click(818, 337);
  await expect(page.getByRole('dialog')).toContainText('The bell is silent', { timeout: 14_000 });
  await page.getByRole('button', { name: 'Return to title' }).click();
  await expect(page.locator('#save-label')).toContainText('Act I complete');
});
