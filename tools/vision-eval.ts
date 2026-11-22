// S39O-cs-visioneval: 识别评测脚本，用真实图片跑「封闭选择」链路并算出 top-1 准确率。
// 实现 遍历测试集 labels.json，逐张调用识别提示词，命中首个候选即算 top-1，无候选计入分母。
// 原理 指标定义与 PRD 一致（无返回候选的样本计入分母），这样数字不会被「弃权」刷高；
// 按 group 分组统计，防止同源图片互相「验证」造成虚高。
import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const TEST_DIR = join(ROOT, 'data', 'vision-test');
const LABELS = join(TEST_DIR, process.env.CS_LABELS || 'labels-clean.json');
const EXPECT_EMPTY = (process.env.CS_LABELS || '').includes('negative');
const IMG_DIR = join(TEST_DIR, 'img');

// 网关或直连由环境变量决定；本机联调走本地网关（Anthropic 格式），生产走 DeepSeek。
const GATEWAY = process.env.CS_GATEWAY || '';
const DEEPSEEK_KEY = process.env.DEEPSEEK_API_KEY || '';

interface Label {
  file: string;
  dishId: string;
  group: string;
  title: string;
}

interface Candidate {
  dishId: string;
  confidence: number;
}

function loadDishIds(): Set<string> {
  const dishes = JSON.parse(readFileSync(join(ROOT, 'src', 'data', 'dishes.json'), 'utf8')) as Array<{
    id: string;
    name: string;
    aliases: string[];
    cooking: string;
    category: string;
  }>;
  return new Set(dishes.map((d) => d.id));
}

function catalogText(): string {
  const dishes = JSON.parse(readFileSync(join(ROOT, 'src', 'data', 'dishes.json'), 'utf8')) as Array<{
    id: string;
    name: string;
    aliases: string[];
    cooking: string;
    category: string;
  }>;
  return dishes
    .map((d) => `${d.id} | ${d.name} | 别名:${d.aliases.join('/') || '无'} | ${d.cooking} | ${d.category}`)
    .join('\n');
}

function systemPrompt(): string {
  return [
    '你是校园食堂的菜品识别助手。用户会给你一张单道菜的照片。',
    '你只能从下面的菜品目录中选择，不得创建目录之外的菜名。',
    '目录格式：id | 标准名 | 别名 | 烹饪方式 | 类别',
    '',
    catalogText(),
    '',
    '只输出 JSON，格式为 {"candidates":[{"dishId":"目录中的id","confidence":0到1之间的小数}]}。',
    '最多 3 个候选，按可能性从高到低排列。',
    '如果照片里看不出是目录中的任何一道菜，返回 {"candidates":[]}。',
  ].join('\n');
}

/** 经本地网关（Anthropic 格式）识别，用于本机联调。 */
async function recognizeViaGateway(b64: string): Promise<Candidate[]> {
  const token = process.env.ANTHROPIC_AUTH_TOKEN || '';
  const res = await fetch('http://127.0.0.1:18790/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': token,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'deepseek-flash',
      max_tokens: 300,
      thinking: { type: 'disabled' },
      messages: [
        { role: 'system', content: systemPrompt() },
        {
          role: 'user',
          content: [
            { type: 'text', text: '识别这张照片里的菜。' },
            {
              type: 'image',
              source: { type: 'base64', media_type: 'image/jpeg', data: b64 },
            },
          ],
        },
      ],
    }),
  });
  if (!res.ok) throw new Error(`gateway HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
  const text = (data.content ?? []).filter((c) => c.type === 'text').map((c) => c.text ?? '').join('');
  return extractCandidates(text);
}

/** 直连 DeepSeek（OpenAI 格式），用于生产链路验证。 */
async function recognizeViaDeepSeek(b64: string): Promise<Candidate[]> {
  const res = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${DEEPSEEK_KEY}` },
    body: JSON.stringify({
      model: 'deepseek-flash',
      max_tokens: 300,
      thinking: { type: 'disabled' },
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt() },
        {
          role: 'user',
          content: [
            { type: 'text', text: '识别这张照片里的菜。' },
            { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${b64}`, detail: 'low' } },
          ],
        },
      ],
    }),
  });
  if (!res.ok) throw new Error(`deepseek HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return extractCandidates(data.choices?.[0]?.message?.content ?? '');
}

function extractCandidates(text: string): Candidate[] {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return [];
  try {
    const parsed = JSON.parse(m[0]) as { candidates?: Candidate[] };
    return Array.isArray(parsed.candidates) ? parsed.candidates : [];
  } catch {
    return [];
  }
}

async function main(): Promise<void> {
  if (!existsSync(LABELS)) {
    console.error(`找不到 ${LABELS}，先运行 python3 tools/fetch-test-images.py`);
    process.exit(2);
  }
  if (!GATEWAY && !DEEPSEEK_KEY) {
    console.error('需要 CS_GATEWAY=1（本地网关）或 DEEPSEEK_API_KEY');
    process.exit(2);
  }

  const labels = JSON.parse(readFileSync(LABELS, 'utf8')) as Label[];
  const valid = loadDishIds();
  const run = GATEWAY ? recognizeViaGateway : recognizeViaDeepSeek;

  let correct = 0;
  let noCandidate = 0;
  const perGroup = new Map<string, { total: number; hit: number }>();
  const misses: string[] = [];

  for (const [i, lab] of labels.entries()) {
    const path = join(IMG_DIR, lab.file);
    if (!existsSync(path)) continue;
    const b64 = readFileSync(path).toString('base64');
    let cands: Candidate[] = [];
    try {
      cands = await run(b64);
    } catch (e) {
      console.error(`[err] ${lab.file}: ${(e as Error).message}`);
    }
    const filtered = cands.filter((c) => valid.has(c.dishId));
    const top = filtered[0]?.dishId ?? null;
    // 负样本：期望模型拒绝识别，返回空候选才算对。
    const hit = EXPECT_EMPTY ? filtered.length === 0 : top === lab.dishId;
    if (hit) correct += 1;
    if (!top) noCandidate += 1;

    const g = perGroup.get(lab.group) ?? { total: 0, hit: 0 };
    g.total += 1;
    if (hit) g.hit += 1;
    perGroup.set(lab.group, g);

    const mark = hit ? '✓' : '✗';
    const expect = EXPECT_EMPTY ? '拒识' : lab.dishId;
    console.log(
      `${mark} [${i + 1}/${labels.length}] ${lab.file} 期望=${expect} 得到=${top ?? '无候选'} (${filtered.length} 个候选)`,
    );
    if (!hit) misses.push(`${lab.file}: 期望 ${expect}，得到 ${top ?? '无候选'}`);
  }

  const total = labels.length;
  const acc = total ? (correct / total) * 100 : 0;
  console.log('\n===== 结果 =====');
  console.log(`样本数 ${total}，top-1 正确 ${correct}，准确率 ${acc.toFixed(1)}%（无候选 ${noCandidate} 张，已计入分母）`);
  console.log('\n按分组：');
  for (const [g, s] of perGroup) {
    console.log(`  ${g}: ${s.hit}/${s.total}`);
  }
  if (misses.length) {
    console.log('\n未命中明细：');
    for (const m of misses) console.log(`  - ${m}`);
  }
}

void main();
