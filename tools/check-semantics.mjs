#!/usr/bin/env node
// S39O-cs-semcheck: 语义索引校验器，检查代码标记与 docs/Semantics.md 条目一一对应。
// 校验 S39O-<ID>: 标记与 docs/Semantics.md 条目一一对应。
//
// 规范来源: ~/.claude/docs/SEMANTICS-SPEC.md（跨项目通用）
//
// 检查项:
//   1. 每个源文件必须至少有一行 S39O-<ID>: 标记
//   2. 代码里出现的 ID 必须已登记在 Semantics.md
//   3. Semantics.md 里的 ID 必须有代码引用（@DEPRECATED 条目除外）
//   4. ID 不得重复，且不得是另一个 ID 的前缀
//   5. 条目第一行必须同时含「语义」「实现」「原理」三段
//   6. @ 行行首必须恰好两个空格（缩进承载语义）
//   7. @REL 指向的 ID 必须存在
//
// 用法: node semantics-check.mjs <项目根目录>
// 退出码: 0 通过 / 1 校验失败 / 2 环境缺失

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, extname } from 'node:path';

const ROOT = process.argv[2] || process.cwd();

if (!existsSync(join(ROOT, 'docs', 'Semantics.md'))) {
	console.error(`[semantics] 找不到 ${join(ROOT, 'docs', 'Semantics.md')}`);
	process.exit(2);
}

const SEM = join(ROOT, 'docs', 'Semantics.md');
// ID 只允许小写字母、数字、连字符
const MARK = /S39O-([a-z0-9-]+):/g;
const ENTRY = /^"([^"]+)":\s*(.*)$/;
const ATTR = /^ {2}@(RULE|TRAP|REL|DEPRECATED) (.+)$/;

// 参与校验的源码扩展名（默认值；项目可用 .semantics.json 覆盖）
// 不含 .sql / .jsonc：它们是数据与配置，不是代码。其关键约束写进相关条目的 @TRAP。
const SRC_EXT = new Set(['.js', '.mjs', '.ts', '.tsx', '.sh']);
// 无扩展名但按名字识别的源文件（如 Dockerfile）
let NAME_EXTS = [];
// 项目级额外排除的路径片段（相对项目根）
let EXTRA_SKIP = [];
// 不扫描的目录
const SKIP_DIR = new Set(['node_modules', '.git', '.wrangler', 'dist', 'build', '__pycache__']);

// ---- 项目级配置 .semantics.json ----
// 用途: 让同一份校验器适配不同技术栈（如 Python 项目要收 .py / .patch / Dockerfile），
// 避免每个项目各写一份实现导致检查项漂移。
// 格式: {"srcExt": [".py", ".patch"], "namePatterns": ["Dockerfile*"], "skip": ["astrbot/data/workspaces"]}
const CFG_PATH = join(ROOT, '.semantics.json');
if (existsSync(CFG_PATH)) {
	try {
		const cfg = JSON.parse(readFileSync(CFG_PATH, 'utf8'));
		if (Array.isArray(cfg.srcExt)) for (const e of cfg.srcExt) SRC_EXT.add(e);
		if (Array.isArray(cfg.namePatterns)) NAME_EXTS = cfg.namePatterns;
		if (Array.isArray(cfg.skip)) EXTRA_SKIP = cfg.skip;
	} catch (e) {
		console.error(`[semantics] .semantics.json 解析失败: ${e.message}`);
		process.exit(2);
	}
}

function nameMatches(name) {
	for (const pat of NAME_EXTS) {
		if (pat.endsWith('*') && name.startsWith(pat.slice(0, -1))) return true;
		if (name === pat) return true;
	}
	return false;
}

// 本工具箱索引只管「自己写的工具脚本」。以下不属于：
//   - 其他项目的软链（各自项目索引管理）
//   - 外部包管理器安装的可执行文件（wrkst/pnpm 等）
// 用白名单而非黑名单：新增外部工具时不必改校验器。
const OWN_SCRIPTS = new Set([
	's39o-proxy',
	's39o-wiki-sync',
	's39o-wiki-postprocess',
	'sec',
	'sec-git-credential',
	'claude-gw',
	'tavily-mcp-wrapper',
	'napcat-qq-watch.sh',
	'semantics-check.mjs',
	'semantics-stub.py',
	'mihomo-sub.py',
	'mihomo-refresh.sh',
	'hc',
	'ucloud-undone.sh',
	'ucloud-health-check.sh',
	'check-keepalive-semantics.sh',
]);

// 归其他项目管的脚本：即使出现在本目录也只由项目索引校验
const EXCLUDE_FILES = new Set([
	'ucloud-undone.sh',            // 属 ~/repos/ucloud-notify
	'ucloud-health-check.sh',      // 属 ~/repos/ucloud-notify
	'check-keepalive-semantics.sh', // 属 ~/.claude-keepalive
]);

const problems = [];
// 工具箱模式下不在 OWN_SCRIPTS 里的脚本：不算错（可能是外部工具），但要报出来
const UNLISTED = [];
const warn = (m) => problems.push(m);

// ---- 递归收集源文件 ----
// 除了按扩展名判断，还要按 shebang 识别无扩展名的脚本（如 s39o-proxy），
// 或按项目配置的 namePatterns（如 Dockerfile*）。
function isScript(p, name) {
	if (SRC_EXT.has(extname(name))) return true;
	if (nameMatches(name)) return true;
	if (extname(name) !== '') return false;
	try {
		const head = readFileSync(p, 'utf8').slice(0, 120);
		return /^#!.*\b(bash|sh|python[0-9.]*|node)\b/.test(head);
	} catch {
		return false;
	}
}

function collect(dir, out = []) {
	for (const name of readdirSync(dir)) {
		if (SKIP_DIR.has(name)) continue;
		const p = join(dir, name);
		// 项目自定义排除（相对项目根的路径片段）
		const relForSkip = relative(ROOT, p);
		if (EXTRA_SKIP.some((s) => relForSkip === s || relForSkip.startsWith(s + '/'))) continue;
		const st = statSync(p);
		if (st.isDirectory()) {
			collect(p, out);
		} else if (isScript(p, name)) {
			if (p === SEM) continue;
			// 白名单与排除清单只在工具箱索引下生效。
			// 项目仓库用全量扫描：项目里每个源文件都必须有标记。
			if (WHITELIST_ONLY) {
				if (EXCLUDE_FILES.has(name)) continue;
				if (!OWN_SCRIPTS.has(name)) {
					// 不在白名单的脚本不会参与校验，但必须报出来：
					// 否则新写的工具会被静默跳过，索引悄悄漏掉它。
					UNLISTED.push(relative(ROOT, p));
					continue;
				}
			}
			out.push(p);
		}
	}
	return out;
}

// 白名单模式：仅在索引目录含 "tool-" 前缀条目时启用。
// 项目仓库用全量扫描（每个源文件都要有标记），工具箱用白名单（只收自己的脚本）。
const WHITELIST_ONLY = existsSync(SEM) && readFileSync(SEM, 'utf8').includes('"tool-');

const files = collect(ROOT).sort();

// ---- 扫源码 ----
const codeIds = new Map(); // ID -> [相对路径]
const noMarker = [];

for (const p of files) {
	const rel = relative(ROOT, p);
	let text;
	try {
		text = readFileSync(p, 'utf8');
	} catch {
		warn(`源文件读取失败: ${rel}`);
		continue;
	}
	const found = new Set();
	for (const m of text.matchAll(MARK)) found.add(m[1]);
	if (found.size === 0) {
		noMarker.push(rel);
		continue;
	}
	for (const id of found) {
		if (!codeIds.has(id)) codeIds.set(id, []);
		codeIds.get(id).push(rel);
	}
}

// ---- 扫索引 ----
const semText = readFileSync(SEM, 'utf8');
const entries = new Map(); // ID -> { desc, attrs, line }
let cur = null;
let inFence = false;
let lineNo = 0;

for (const line of semText.split('\n')) {
	lineNo++;

	// 代码围栏内是格式示例，不是真实条目
	if (line.trimStart().startsWith('```')) {
		inFence = !inFence;
		cur = null;
		continue;
	}
	if (inFence) {
		cur = null;
		continue;
	}

	const e = line.match(ENTRY);
	if (e) {
		cur = e[1];
		if (entries.has(cur)) warn(`索引 ID 重复: "${cur}"（第 ${lineNo} 行）`);
		entries.set(cur, { desc: e[2], attrs: new Set(), rels: [], line: lineNo });
		continue;
	}

	// @ 行必须以恰好两个空格开头；三空格及以上视为缩进错误
	if (cur && /^\s+@(RULE|TRAP|REL|DEPRECATED)\b/.test(line)) {
		const m = line.match(ATTR);
		if (!m) {
			warn(`第 ${lineNo} 行 @ 标记缩进错误（必须恰好两个空格）: ${line.trim()}`);
		} else {
			const entry = entries.get(cur);
			entry.attrs.add(m[1]);
			if (m[1] === 'REL') entry.rels.push(m[2].trim());
		}
		continue;
	}
	// 零缩进的 @ 行：格式化工具吃掉缩进后就是这样，会被当成描述续行而静默失效。
	// 必须显式报错，否则整个索引的 RULE/TRAP 全部哑掉且校验仍「通过」。
	if (cur && /^@(RULE|TRAP|REL|DEPRECATED)\b/.test(line)) {
		warn(`第 ${lineNo} 行 @ 标记缺少两空格缩进（会被当成描述续行）: ${line.slice(0, 50)}`);
		entries.get(cur).attrs.add('__MALFORMED__');
		continue;
	}

	// 空行结束当前条目；其他非 @ 行若非空则视为描述续行（不规范），结束条目
	if (line.trim() === '') {
		cur = null;
	}
}

// ---- 校验 ----

// 1. 源文件必须有标记
if (noMarker.length) {
	warn(`以下源文件没有任何 S39O-<ID>: 标记:\n    ${noMarker.join('\n    ')}`);
}

// 2. 代码 ID 必须已登记
for (const [id, where] of codeIds) {
	if (!entries.has(id)) {
		warn(`代码用了未登记的 ID "${id}"（出现在: ${[...new Set(where)].join(', ')}）`);
	}
}

// 3. 索引 ID 必须有代码引用（@DEPRECATED 免除）
for (const [id, entry] of entries) {
	if (entry.attrs.has('DEPRECATED')) continue;
	if (!codeIds.has(id)) {
		warn(`索引登记了代码中不存在的 ID "${id}"（若已废弃请标 @DEPRECATED）`);
	}
}

// 4. ID 不得重复（已在上面记过）；不得是另一个的前缀
const ids = [...entries.keys()];
for (const a of ids) {
	for (const b of ids) {
		if (a !== b && b.startsWith(a)) {
			warn(`ID 前缀冲突: "${a}" 是 "${b}" 的前缀（grep -F 会互相命中）`);
		}
	}
}

// 5. 第一行必须三段齐全
for (const [id, entry] of entries) {
	if (entry.attrs.has('DEPRECATED')) continue;
	const d = entry.desc;
	const missing = [];
	if (!d.includes('实现')) missing.push('实现');
	if (!d.includes('原理')) missing.push('原理');
	// 「语义」段允许用任意开头描述，但规范要求第一行含三段，这里只硬校验后两段
	if (missing.length) {
		warn(`条目 "${id}" 第一行缺少「${missing.join('」「')}」段`);
	}
}

// 6. @ 行缩进已在解析时校验
// 7. @REL 必须指向存在的 ID
for (const [id, entry] of entries) {
	for (const r of entry.rels) {
		if (!entries.has(r)) {
			warn(`条目 "${id}" 的 @REL 指向不存在的 ID "${r}"`);
		}
	}
}

// ---- 输出 ----
if (UNLISTED.length > 0) {
	console.error(`[semantics] 提示：以下脚本不在 OWN_SCRIPTS 白名单里，本次未参与校验：`);
	for (const f of UNLISTED) console.error(`  - ${f}`);
	console.error(`  自建工具请加进 semantics-check.mjs 的 OWN_SCRIPTS；外部工具可忽略。`);
}

if (problems.length === 0) {
	console.error(`[semantics] 通过：${files.length} 个源文件，${entries.size} 个条目`);
	process.exit(0);
}

console.error(`[semantics] 失败，${problems.length} 个问题:`);
for (const p of problems) console.error(`  - ${p}`);
process.exit(1);
