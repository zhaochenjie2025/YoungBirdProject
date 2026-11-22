// S39O-cs-smoke-recognize: 浏览器端识别流程冒烟，验证「选图 → 识别 → 选候选 → 选份量 → 加入草稿」。
// 实现 注入一个本地转发的 API key，把测试图片塞进文件输入，等识别结果出现后逐级点击。
// 原理 生产端点 api.deepseek.com，但测试在离线环境也能跑：通过页面拦截把请求转到本地网关，
// 这样验证的是应用自身的接线，而不是网络可达性。
import { chromium } from 'playwright-core';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const BASE = process.env.SMOKE_URL || 'http://127.0.0.1:5274/';
const IMG = join(ROOT, 'data/vision-test/img/tomato-egg-0.jpg');
const GATEWAY = 'http://127.0.0.1:18790';

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
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    locale: 'zh-CN',
  });
  const page = await context.newPage();

  // 把发往 api.deepseek.com 的请求转成本地网关的 Anthropic 格式响应。
  await page.route('https://api.deepseek.com/**', async (route) => {
    const req = route.request();
    const body = JSON.parse(req.postData() ?? '{}') as {
      messages: Array<{ role: string; content: unknown }>;
    };
    const sys = body.messages.find((m) => m.role === 'system')?.content as string;
    const user = body.messages.find((m) => m.role === 'user')?.content as Array<{
      type: string;
      text?: string;
      image_url?: { url: string };
    }>;
    const imgPart = user?.find((p) => p.type === 'image_url');
    const b64 = imgPart?.image_url?.url.replace(/^data:image\/[a-z]+;base64,/, '') ?? '';

    const gwRes = await fetch(`${GATEWAY}/v1/messages`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_AUTH_TOKEN ?? '',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'deepseek-flash',
        max_tokens: 300,
        thinking: { type: 'disabled' },
        messages: [
          { role: 'system', content: sys },
          {
            role: 'user',
            content: [
              { type: 'text', text: '识别这张照片里的菜。' },
              { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: b64 } },
            ],
          },
        ],
      }),
    });
    const gwJson = (await gwRes.json()) as { content?: Array<{ type: string; text?: string }> };
    const text = (gwJson.content ?? [])
      .filter((c) => c.type === 'text')
      .map((c) => c.text ?? '')
      .join('');
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 'mock',
        object: 'chat.completion',
        choices: [{ index: 0, message: { role: 'assistant', content: text }, finish_reason: 'stop' }],
      }),
    });
  });

  await page.goto(BASE, { waitUntil: 'networkidle' });

  // 配置 key
  await page.goto(BASE + '#/settings', { waitUntil: 'networkidle' });
  await page.locator('#apikey').fill('sk-test-key-for-smoke');
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await page.waitForTimeout(200);
  check('保存 key', (await page.locator('body').innerText()).includes('已配置'));

  // 进入记录页并拍照
  await page.goto(BASE + '#/new', { waitUntil: 'networkidle' });
  await page.waitForTimeout(200);

  const buf = readFileSync(IMG);
  await page.locator('input[type=file]').first().setInputFiles({
    name: 'test.jpg',
    mimeType: 'image/jpeg',
    buffer: buf,
  });

  // 等识别结果
  await page.locator('text=识别结果，请选一个').waitFor({ timeout: 90_000 }).catch(() => {});
  const hasCandidates = (await page.locator('text=识别结果，请选一个').count()) > 0;
  check('识别返回候选', hasCandidates);

  if (hasCandidates) {
    const firstCandidate = page.locator('.card .result').first();
    const candText = await firstCandidate.innerText();
    check('候选是番茄炒蛋', candText.includes('番茄炒蛋'), candText.split('\n')[0]);
    await firstCandidate.click();
    await page.waitForTimeout(200);
    check('进入份量选择', (await page.locator('text=你吃了多少').count()) > 0);

    await page.getByRole('button', { name: /加入这一餐/ }).click();
    await page.waitForTimeout(200);
    const added = await page.locator('text=这一餐的菜品').count();
    check('识别结果加入草稿', added > 0);

    // 保存并验证
    await page.getByRole('button', { name: /保存这一餐/ }).click();
    await page.waitForTimeout(400);
    check('保存后进入明细', (await page.locator('text=菜品明细').count()) > 0);
  }

  await browser.close();
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} 通过`);
  process.exit(failed.length === 0 ? 0 : 1);
}

void main().catch((e) => {
  console.error('识别冒烟异常:', e);
  process.exit(2);
});
