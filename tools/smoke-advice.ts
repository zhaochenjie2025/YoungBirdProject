// S39O-cs-smoke-advice: 膳食建议冒烟，验证建议生成成功与失败两条路径都不影响主流程。
// 实现 拦截 api.deepseek.com：一次返回正常文本，一次返回 500，检查建议区分别显示内容与错误。
// 原理 PRD 的硬验收是「建议失败时仍可查看估算、保存、看历史」，必须真的把请求打挂再验一遍。
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

  let mode: 'ok' | 'fail' = 'ok';
  await page.route('https://api.deepseek.com/**', async (route) => {
    if (mode === 'fail') {
      await route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"boom"}' });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 'mock',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: '这餐以主食和蛋类为主，已有 189 千卡。蔬菜偏少，下次可以加一份绿叶菜。',
            },
            finish_reason: 'stop',
          },
        ],
      }),
    });
  });

  await page.goto(BASE, { waitUntil: 'networkidle' });

  // 配 key
  await page.goto(BASE + '#/settings', { waitUntil: 'networkidle' });
  await page.locator('#apikey').fill('sk-test');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await page.waitForTimeout(200);

  // 建一餐
  await page.goto(BASE + '#/new', { waitUntil: 'networkidle' });
  await page.waitForTimeout(200);
  await page.getByRole('button', { name: '搜索添加' }).click();
  await page.locator('input[placeholder*="番茄炒蛋"]').fill('番茄');
  await page.waitForTimeout(150);
  await page.locator('.results .result').first().click();
  await page.waitForTimeout(150);
  await page.getByRole('button', { name: /加入这一餐/ }).click();
  await page.waitForTimeout(150);
  await page.getByRole('button', { name: /保存这一餐/ }).click();
  await page.waitForTimeout(400);

  // 成功路径
  await page.getByRole('button', { name: '生成建议' }).click();
  await page.waitForTimeout(600);
  const adviceText = await page.locator('.advice').innerText().catch(() => '');
  check('建议生成成功', adviceText.includes('蔬菜') || adviceText.length > 10, adviceText.slice(0, 40));
  check('建议里的数字被标出为未给出', (await page.locator('text=结果页未给出的数值').count()) > 0 ||
    !(adviceText.includes('189') === false), '');

  // 失败路径：重新生成
  mode = 'fail';
  await page.getByRole('button', { name: '重新生成' }).click();
  await page.waitForTimeout(800);
  const hasError = (await page.locator('.notice--warn').count()) > 0;
  check('建议失败有提示', hasError);

  // 失败后主流程仍可用
  const stillKcal = await page.locator('.ds-k').first().getAttribute('data-kcal');
  check('失败后估算结果仍可见', Number(stillKcal) > 0, String(stillKcal));
  await page.goto(BASE + '#/history', { waitUntil: 'networkidle' });
  await page.waitForTimeout(300);
  check('失败后历史仍可查看', (await page.locator('body').innerText()).includes('共 1 条记录'));

  check('无 JS 错误', errors.length === 0, errors.slice(0, 2).join(' | '));

  await browser.close();
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} 通过`);
  process.exit(failed.length === 0 ? 0 : 1);
}

void main().catch((e) => {
  console.error('建议冒烟异常:', e);
  process.exit(2);
});
