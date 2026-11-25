// S39O-cs-smoke-core: 浏览器端到端冒烟测试，验证 PRD 的核心流程在真实浏览器里走得通。
// 实现 用 Playwright 驱动 headless chromium，以手机尺寸走完「搜索添加 → 改份量 → 保存 → 历史 → 删除」。
// 原理 单测只覆盖纯函数，PRD 要求「刷新后记录仍在」「改删后统计一致」必须真的在浏览器里验一遍，
// 否则存储与渲染的接线错误会漏掉。
import { chromium } from 'playwright-core';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const BASE = process.env.SMOKE_URL || 'http://127.0.0.1:5274/';

function findChrome(): string {
  const candidates = [
    join(homedir(), '.cache/ms-playwright/chromium-1228/chrome-linux64/chrome'),
    join(homedir(), '.cache/ms-playwright/chromium-1234/chrome-linux64/chrome'),
  ];
  for (const c of candidates) if (existsSync(c)) return c;
  return 'chromium';
}

const results: Array<{ name: string; ok: boolean; detail?: string }> = [];
function check(name: string, ok: boolean, detail?: string) {
  results.push({ name, ok, detail });
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
}

async function main() {
  const browser = await chromium.launch({
    executablePath: findChrome(),
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    locale: 'zh-CN',
  });
  const page = await context.newPage();

  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });

  await page.goto(BASE, { waitUntil: 'networkidle' });
  check('首页加载', (await page.locator('h1').first().innerText()).includes('今日'));

  // 未配置 key 时应提示，但手动/搜索仍可用
  check('未配置 key 有提示', (await page.locator('.notice--info').count()) > 0);

  // 进入记录页
  await page.getByRole('button', { name: /记录这一餐/ }).click();
  await page.waitForTimeout(200);
  check('进入记录页', (await page.locator('.cam-body').count()) > 0);

  // 搜索添加
  await page.getByRole('button', { name: '搜索添加' }).click();
  await page.locator('input[placeholder*="番茄炒蛋"]').fill('番茄');
  await page.waitForTimeout(150);
  const resultCount = await page.locator('.results .result').count();
  check('搜索返回结果', resultCount > 0, `${resultCount} 条`);

  await page.locator('.results .result').first().click();
  await page.waitForTimeout(150);
  check('进入份量选择', (await page.locator('text=你吃了多少').count()) > 0);
  await page.getByRole('button', { name: /加入这一餐/ }).click();
  await page.waitForTimeout(150);

  // 菜品已加入草稿
  const itemCount = await page.locator('.portions').count();
  check('菜品加入草稿', itemCount > 0);

  // 改成半份，检查热量变化
  const kcalBefore = await page.locator('.ds-k').first().getAttribute('data-kcal');
  const halfBtn = page.locator('.portion', { hasText: '半份' }).first();
  if ((await halfBtn.count()) > 0) {
    await halfBtn.click();
    await page.waitForTimeout(150);
    const kcalAfter = await page.locator('.ds-k').first().getAttribute('data-kcal');
    check('改份量后热量同步变化', kcalBefore !== kcalAfter, `${kcalBefore} → ${kcalAfter}`);
  } else {
    check('改份量后热量同步变化', false, '找不到半份选项');
  }

  // 保存
  await page.getByRole('button', { name: /保存这一餐/ }).click();
  await page.waitForTimeout(400);
  check('保存后进入明细', (await page.locator('.print.res-print').count()) > 0);

  let hash = await page.evaluate(() => location.hash);
  check('URL 指向明细页', hash.startsWith('#/meal/'), hash);

  // 刷新后记录仍在
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(300);
  check('刷新后明细仍可见', (await page.locator('.print.res-print').count()) > 0);

  // 回到今日页，检查汇总
  await page.goto(BASE + '#/today', { waitUntil: 'networkidle' });
  await page.waitForTimeout(300);
  const todayText = await page.locator('body').innerText();
  check('今日页显示已记录', todayText.includes('已记录'), '');
  check('今日页无空状态', !todayText.includes('今天还没有记录'));

  // 历史页
  await page.goto(BASE + '#/history', { waitUntil: 'networkidle' });
  await page.waitForTimeout(300);
  check('历史页有记录', (await page.locator('.card').count()) > 0);

  // 周视图
  await page.goto(BASE + '#/week', { waitUntil: 'networkidle' });
  await page.waitForTimeout(300);
  const weekCells = await page.locator('.wcol').count();
  check('周视图七个格子', weekCells === 7, `${weekCells}`);

  // 删除
  await page.goto(BASE + hash, { waitUntil: 'networkidle' });
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: '删除', exact: true }).click();
  await page.waitForTimeout(150);
  await page.getByRole('button', { name: '确认删除' }).click();
  await page.waitForTimeout(400);

  await page.goto(BASE + '#/today', { waitUntil: 'networkidle' });
  await page.waitForTimeout(300);
  const afterDelete = await page.locator('body').innerText();
  check('删除后回到空状态', afterDelete.includes('今天还没有记录'));

  // 窄屏测试
  await page.setViewportSize({ width: 360, height: 740 });
  await page.waitForTimeout(200);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  );
  check('360 宽无横向溢出', !overflow);

  check('无 JS 运行时错误', errors.length === 0, errors.slice(0, 3).join(' | '));

  await browser.close();

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} 通过`);
  process.exit(failed.length === 0 ? 0 : 1);
}

void main().catch((e) => {
  console.error('冒烟测试异常:', e);
  process.exit(2);
});
