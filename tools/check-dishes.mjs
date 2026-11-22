// S39O-cs-dishcheck: 菜品库校验器，构建前置。课件库是数据可信度的唯一保证，必须机器核查。
// 实现 检查条目数、必填字段、ID 唯一性、份量含标准份、营养值范围、出处齐全。
// 原理 PRD 要求每条菜品都有可追溯出处与参考份量来源，人工核对会漏；脚本化后新增条目无法绕过。
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.argv[2] || process.cwd();
const FILE = join(ROOT, 'src', 'data', 'dishes.json');

const CATEGORIES = new Set(['蔬菜', '荤菜', '主食', '汤', '蛋豆', '其他']);
const problems = [];
const warn = (m) => problems.push(m);

let dishes;
try {
  dishes = JSON.parse(readFileSync(FILE, 'utf8'));
} catch (e) {
  console.error(`[dishes] 读取失败: ${e.message}`);
  process.exit(2);
}

if (!Array.isArray(dishes)) {
  console.error('[dishes] 顶层必须是数组');
  process.exit(2);
}

if (dishes.length < 20) {
  warn(`菜品数 ${dishes.length}，PRD 要求不少于 20 类`);
}

const ids = new Set();
const idRe = /^[a-z0-9-]+$/;
const numOrNull = (v) => v === null || (typeof v === 'number' && Number.isFinite(v));

for (const [i, d] of dishes.entries()) {
  const where = `第 ${i + 1} 条「${d?.name ?? '?'}」`;
  if (typeof d?.id !== 'string' || !idRe.test(d.id)) {
    warn(`${where}: id 非法（只允许小写字母数字与连字符）`);
  } else if (ids.has(d.id)) {
    warn(`${where}: id 重复 "${d.id}"`);
  } else {
    ids.add(d.id);
  }
  if (typeof d?.name !== 'string' || !d.name.trim()) warn(`${where}: 缺标准菜名`);
  if (!Array.isArray(d?.aliases)) warn(`${where}: aliases 必须是数组`);
  if (typeof d?.cooking !== 'string' || !d.cooking.trim()) warn(`${where}: 缺烹饪方式`);
  if (!CATEGORIES.has(d?.category)) warn(`${where}: category 非法 "${d?.category}"`);

  const p = d?.per100g;
  if (!p || typeof p !== 'object') {
    warn(`${where}: 缺 per100g`);
  } else {
    for (const k of ['kcal', 'protein', 'fat', 'carbs']) {
      if (!(k in p)) warn(`${where}: per100g 缺字段 ${k}`);
      else if (!numOrNull(p[k])) warn(`${where}: per100g.${k} 必须是数字或 null`);
    }
    if (typeof p.kcal === 'number' && (p.kcal < 0 || p.kcal > 900)) {
      warn(`${where}: per100g.kcal=${p.kcal} 超出合理范围 0~900`);
    }
  }

  if (!d?.source?.name) warn(`${where}: 缺营养数据出处 source.name`);
  if (!Array.isArray(d?.portions) || d.portions.length === 0) {
    warn(`${where}: 至少需要一个份量选项`);
  } else {
    const keys = new Set();
    let hasStandard = false;
    for (const opt of d.portions) {
      if (!opt?.key || typeof opt.label !== 'string') warn(`${where}: 份量选项缺 key/label`);
      if (keys.has(opt?.key)) warn(`${where}: 份量 key 重复 "${opt?.key}"`);
      keys.add(opt?.key);
      if (!(typeof opt?.grams === 'number' && opt.grams > 0)) {
        warn(`${where}: 份量 "${opt?.label}" 的 grams 必须为正数`);
      }
      if (opt?.key === 'standard') hasStandard = true;
    }
    if (!hasStandard) warn(`${where}: 缺少 key 为 standard 的标准份`);
  }
  if (!d?.portionSource?.name) warn(`${where}: 缺份量数据出处 portionSource.name`);

  if (d?.kcalRange !== undefined) {
    const r = d.kcalRange;
    if (!Array.isArray(r) || r.length !== 2 || !(r[0] < r[1])) {
      warn(`${where}: kcalRange 必须是 [下限, 上限] 且下限 < 上限`);
    }
  }
}

if (problems.length === 0) {
  console.error(`[dishes] 通过：${dishes.length} 个菜品，全部字段完整`);
  process.exit(0);
}
console.error(`[dishes] 失败，${problems.length} 个问题:`);
for (const p of problems) console.error(`  - ${p}`);
process.exit(1);
