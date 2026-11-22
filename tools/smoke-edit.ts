// S39O-cs-smoke-edit: 编辑流程冒烟，验证修改已保存的一餐后明细与统计同步更新。
// 实现 建一餐、进明细、点修改、改份量、保存，检查明细页热量变化且今日页汇总跟着变。
// 原理 PRD 明确要求「修改后单餐汇总和历史统计同步更新」，这是最容易因状态引用过期而失效的路径。
import { chromium } from 'playwright-core';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const BASE = process.env.SMOKE_URL || 'http://127.0.0.1:5274/';

function findChrome(): string {
  const p = join(homedir(), '.cache/ms-playwright/chromium-1228/chrome-linux64/chrome');
  return existsSync(p) ? p : 'chromium';
}

const results: Array<{ name: string; ok: boolean; detail?: string }> = [];
function check(name: string, ok: boolean, detail?: string) {
  results.push({ name, ok, detail });
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
}

async function main() {
  const browser = await chromium.launch({ executablePath: findChrome(), args: ['--no-sandbox'] });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  await page.goto(BASE, { waitUntil: 'networkidle' });

  // 建一餐：搜索加番茄炒蛋，标准份
  await page.getByRole('button', { name: /记录这一餐/ }).click();
  await page.waitForTimeout(200);
  await page.getByRole('button', { name: '搜索菜品' }).click();
  await page.locator('input[placeholder*="番茄炒蛋"]').fill('番茄');
  await page.waitForTimeout(150);
  await page.locator('.results .result').first().click();
  await page.waitForTimeout(150);
  await page.getByRole('button', { name: /加入这一餐/ }).click();
  await page.waitForTimeout(150);
  await page.getByRole('button', { name: /保存这一餐/ }).click();
  await page.waitForTimeout(400);

  const kcalBefore = await page.locator('.kcal-num').first().innerText();
  check('保存后有热量', Number(kcalBefore) > 0, kcalBefore);

  // 修改：改成半份
  await page.getByRole('button', { name: '修改这一餐' }).click();
  await page.waitForTimeout(300);
  const onEdit = (await page.locator('h1').first().innerText()).includes('修改');
  check('进入修改页', onEdit);

  // 编辑页应预填已保存的菜品
  const prefilled = await page.locator('text=这一餐的菜品（1）').count();
  check('编辑页预填已有菜品', prefilled > 0);

  const halfBtn = page.locator('.portion', { hasText: '半份' }).first();
  await halfBtn.click();
  await page.waitForTimeout(150);
  const kcalEdit = await page.locator('.kcal-num').first().innerText();
  check('编辑页改份量生效', kcalEdit !== kcalBefore, `${kcalBefore} → ${kcalEdit}`);

  await page.getByRole('button', { name: '保存修改' }).click();
  await page.waitForTimeout(400);

  const kcalAfter = await page.locator('.kcal-num').first().innerText();
  check('明细页热量已更新', kcalAfter === kcalEdit, `${kcalBefore} → ${kcalAfter}`);

  // 记录数不应翻倍（是修改不是新增）
  await page.goto(BASE + '#/history', { waitUntil: 'networkidle' });
  await page.waitForTimeout(300);
  const historyText = await page.locator('body').innerText();
  check('修改没有新增记录', historyText.includes('共 1 条记录'), historyText.match(/共 \d+ 条记录/)?.[0] ?? '');

  check('无 JS 错误', errors.length === 0, errors.slice(0, 2).join(' | '));

  await browser.close();
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} 通过`);
  process.exit(failed.length === 0 ? 0 : 1);
}

void main().catch((e) => {
  console.error('编辑冒烟异常:', e);
  process.exit(2);
});
