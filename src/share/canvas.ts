// S39O-cs-share: 分享明信片的 Canvas 绘制模块，把统计数据画成 1080×1350 的拍立得样片并可保存为 PNG。
// 实现 纯绘制函数 drawShare 只读入调用方算好的 ShareData 落笔，downloadShare 触发 PNG 下载并在被拦截时返回 false。
// 原理 数据与绘制分离：本模块不碰 store、localStorage 或 domain 取数，同一份 ShareData 在测试与浏览器里都能确定性复现，页面层换算法也不牵动画工。
import type { MacroShare } from '../domain/nutrition';
import { dishPhoto } from '../data/photos';

/** 分享范围：单餐 / 一天 / 一周。由页面组件持有并据此拼装 ShareData。 */
export type ShareScope = 'meal' | 'day' | 'week';

/** 画布尺寸常量（像素）。导出样片固定 1080×1350，适配小红书/朋友圈竖图。 */
export const SHARE_SIZE: { width: number; height: number } = { width: 1080, height: 1350 };

/** 一条明细：菜名与千卡；kcal 为 null 表示待估算。 */
export interface ShareItem {
  name: string;
  /** 已取整的千卡；缺营养数据时为 null，绘制为「待估算」。 */
  kcal: number | null;
}

/** 周视图的单日柱：空日、当日高亮、供能分段。share 为 null 时退化单色柱。 */
export interface ShareBar {
  empty: boolean;
  kcal: number;
  share: MacroShare | null;
  today: boolean;
  /** 柱下标签，如「今」或日期字。 */
  dayLbl: string;
}

/** 页面渲染前由调用方从 domain 层算好的数据，drawShare 只消费不取数。 */
export interface ShareData {
  /** 顶部大字，如「这一餐」「这一天」「这一周」。 */
  kicker: string;
  /** 右上角日期戳，如「LUNCH 11:52」「'26 11 23 MON」「'26 11 W47」。 */
  stamp: string;
  /** 菜品 ID；周视图无主图时为 null。经 dishPhoto 取图后裁切填充。 */
  photo: string | null;
  /** 照片右下角短日期叠加；不传则不画（避免写死过期日期）。 */
  photoDate?: string;
  /** 总热量（千卡，已取整）。 */
  kcal: number;
  /** 待估算条目数；>0 时展示「含 N 道待估」。 */
  todo: number;
  /** 三大营养素供能占比（用 domain 的 macroShare() 算）；不完整时为 null，退化单色条。 */
  share: MacroShare | null;
  /** 底部签名文案。 */
  caption: string;
  /** 餐/日视图的明细列表；周视图不传。 */
  items?: ShareItem[];
  /** 周视图已记录天数；不传则由 bars 非空计数推算。 */
  logged?: number;
  /** 周视图逐日柱；非周视图不传。 */
  bars?: ShareBar[];
}

const SERIF = '"Songti SC","STSong","Noto Serif CJK SC","Noto Serif SC","Source Han Serif SC",Georgia,serif';
const MONO = '"SFMono-Regular",ui-monospace,"Menlo","Consolas","Noto Sans Mono CJK SC",monospace';

/** 千卡格式化：取整并加千分位。 */
function fmt(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}

/** 图片缓存：按已解析出的图片地址缓存，重复绘制不重复请求。 */
const photoCache = new Map<string, HTMLImageElement>();

/**
 * 按菜品 ID 取图并解码。dishPhoto 返回 null 或图片加载失败都降级为 null，
 * 由调用方画占位色块，绝不抛异常让整张明信片白屏。
 */
function loadPhoto(id: string): Promise<HTMLImageElement | null> {
  const src = dishPhoto(id);
  if (!src) return Promise.resolve(null);
  const cached = photoCache.get(src);
  if (cached) return Promise.resolve(cached);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      photoCache.set(src, img);
      resolve(img);
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/** 圆角矩形路径（不填充）。 */
function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** 以「裁切填充」方式把图片铺满目标框，保持比例不拉伸。 */
function drawImageCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  const ir = img.width / img.height;
  const tr = w / h;
  let sx = 0;
  let sy = 0;
  let sw = img.width;
  let sh = img.height;
  if (ir > tr) {
    sw = img.height * tr;
    sx = (img.width - sw) / 2;
  } else {
    sh = img.width / tr;
    sy = (img.height - sh) / 2;
  }
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}
/** 手绘蜡笔圈：三道错位抖动弧线，模拟铅笔圈重点。 */
function crayonRing(ctx: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number): void {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const passes = [
    { w: 9, a: 0.28, dx: -2, dy: 1, s: 0.05, span: 1.02 },
    { w: 6, a: 0.52, dx: 1, dy: -1, s: -0.04, span: 0.98 },
    { w: 3.6, a: 0.72, dx: 0, dy: 0, s: 0.02, span: 0.92 },
  ];
  passes.forEach((p, pi) => {
    const start = p.span * (0.06 + pi * 0.02);
    const end = Math.PI * 2 * p.span + 0.16;
    const segs = 28;
    ctx.beginPath();
    for (let j = 0; j <= segs; j += 1) {
      const t = start + (end - start) * (j / segs);
      const wob = 1 + 0.04 * Math.sin(t * 3 + p.s * 20) + 0.018 * Math.sin(t * 7);
      const x = cx + p.dx + Math.cos(t) * rx * wob;
      const y = cy + p.dy + Math.sin(t) * ry * wob;
      if (j === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = `rgba(214,92,58,${p.a})`;
    ctx.lineWidth = p.w;
    ctx.stroke();
  });
  ctx.restore();
}

/** 印章：双圈 + 「已记」字样，轻微倾斜。 */
function inkStamp(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-0.12);
  ctx.strokeStyle = 'rgba(214,92,58,.84)';
  ctx.fillStyle = 'rgba(214,92,58,.84)';
  ctx.lineWidth = 3.6;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.arc(0, 0, r - 7, 0, Math.PI * 2);
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `700 ${Math.round(r * 0.8)}px ${SERIF}`;
  ctx.fillText('已记', 0, 2);
  ctx.restore();
}

/** 三大营养素供能占比堆叠条。share 为 null 时退化为一条灰米色占位条。 */
function drawStackBar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  share: MacroShare | null,
  radius: number,
): void {
  ctx.save();
  roundRect(ctx, x, y, w, h, radius);
  ctx.clip();
  if (!share) {
    ctx.fillStyle = '#ebe2cf';
    ctx.fillRect(x, y, w, h);
    ctx.restore();
    return;
  }
  const parts: Array<[number, string, string]> = [
    [share.protein, '#a8d48c', '#7cb363'],
    [share.fat, '#f5be6b', '#e2943b'],
    [share.carbs, '#8ac8ba', '#62a699'],
  ];
  let bx = x;
  for (const [v, l1, l2] of parts) {
    if (v <= 0.002) continue;
    const bw = w * v;
    const gr = ctx.createLinearGradient(0, y, 0, y + h);
    gr.addColorStop(0, l1);
    gr.addColorStop(1, l2);
    ctx.fillStyle = gr;
    ctx.fillRect(bx, y, bw, h);
    bx += bw;
  }
  ctx.restore();
}
/**
 * 把 ShareData 画到给定 canvas 上，纯绘制、不取数。
 * 会先按 SHARE_SIZE 校正画布像素尺寸，再在 devicePixelRatio 无关的逻辑坐标系下落笔。
 */
export async function drawShare(canvas: HTMLCanvasElement, data: ShareData): Promise<void> {
  const W = SHARE_SIZE.width;
  const H = SHARE_SIZE.height;
  if (canvas.width !== W) canvas.width = W;
  if (canvas.height !== H) canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, W, H);
  const P = 58;

  // 暖阳奶油底 + 柔绿/蜜桃晨光晕
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#fcf7eb');
  bg.addColorStop(1, '#f3ead6');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  let g = ctx.createRadialGradient(W * 0.15, H * 0.04, 0, W * 0.15, H * 0.04, W * 0.75);
  g.addColorStop(0, 'rgba(218,238,200,.72)');
  g.addColorStop(1, 'rgba(218,238,200,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  g = ctx.createRadialGradient(W * 0.88, H * 0.08, 0, W * 0.88, H * 0.08, W * 0.65);
  g.addColorStop(0, 'rgba(255,226,204,.62)');
  g.addColorStop(1, 'rgba(255,226,204,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // 顶栏
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#6ea462';
  ctx.beginPath();
  ctx.arc(P + 8, 72, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#385e33';
  ctx.font = `700 24px ${MONO}`;
  ctx.fillText('CALORIE SNAP', P + 28, 72);
  ctx.textAlign = 'right';
  ctx.fillStyle = '#8d7b68';
  ctx.font = `600 22px ${MONO}`;
  ctx.fillText(data.stamp, W - P, 72);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#33261b';
  ctx.font = `800 54px ${SERIF}`;
  // 标题基线留到 146：顶部胶带从 164 起，再低就会被胶带压住字脚。
  ctx.fillText(data.kicker, P, 146);

  // 珍珠白拍立得相纸本体
  const cardX = P;
  const cardY = 186;
  const cardW = W - P * 2;
  const cardH = H - cardY - 110;
  ctx.save();
  ctx.shadowColor = 'rgba(104,84,54,.22)';
  ctx.shadowBlur = 48;
  ctx.shadowOffsetY = 16;
  ctx.fillStyle = '#fffdf8';
  roundRect(ctx, cardX, cardY, cardW, cardH, 10);
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = 'rgba(212,196,166,.75)';
  ctx.lineWidth = 2;
  roundRect(ctx, cardX, cardY, cardW, cardH, 10);
  ctx.stroke();

  // 顶部鼠尾草和纸胶带：贴在相纸上沿，只压纸不压字。
  // 标题基线在 146，字顶约 108、字脚约 146，胶带从 164 起，中间留 18px 空隙。
  ctx.save();
  ctx.translate(cardX + 128, cardY - 4);
  ctx.rotate(-0.04);
  ctx.fillStyle = 'rgba(204,228,188,.92)';
  ctx.fillRect(-90, -18, 180, 36);
  ctx.restore();

  const inX = cardX + 32;
  const inW = cardW - 64;
  const cardBottom = cardY + cardH;
  let cursorY = cardY + 30;

  // 主图（有则画，失败画占位色块）
  if (data.photo) {
    const phH = Math.round(inW * 0.68);
    const img = await loadPhoto(data.photo);
    ctx.save();
    roundRect(ctx, inX, cursorY, inW, phH, 6);
    ctx.clip();
    ctx.fillStyle = '#ede3cf';
    ctx.fillRect(inX, cursorY, inW, phH);
    if (img) drawImageCover(ctx, img, inX, cursorY, inW, phH);
    ctx.restore();
    if (data.photoDate) {
      ctx.textAlign = 'right';
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = '#fff4d8';
      ctx.font = `600 24px ${MONO}`;
      ctx.fillText(data.photoDate, inX + inW - 18, cursorY + phH - 16);
    }
    cursorY += phH;
  }

  // 周视图柱状图
  if (data.bars) {
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#33261b';
    ctx.font = `800 58px ${SERIF}`;
    const kt = fmt(data.kcal);
    ctx.fillText(kt, inX + 6, cursorY + 54);
    const kw = ctx.measureText(kt).width;
    ctx.font = `600 24px ${SERIF}`;
    ctx.fillStyle = '#8d7b68';
    const logged = data.logged ?? data.bars.filter((b) => !b.empty).length;
    ctx.fillText(`千卡，本周已记 ${logged} 天`, inX + kw + 28, cursorY + 54);
    crayonRing(ctx, inX + 6 + kw * 0.5, cursorY + 34, kw * 0.5 + 14, 34);
    cursorY += 80;

    const barTopW = cardBottom - 118;
    const ch = Math.max(220, barTopW - cursorY - 34);
    ctx.fillStyle = '#faf5ea';
    roundRect(ctx, inX, cursorY, inW, ch, 10);
    ctx.fill();
    const plotX = inX + 24;
    const plotW = inW - 48;
    const plotH = ch - 72;
    const baseY = cursorY + ch - 38;
    const maxK = Math.max(1, ...data.bars.filter((b) => !b.empty).map((b) => b.kcal));
    const yMax = Math.ceil((maxK * 1.15) / 50) * 50;
    const slot = plotW / 7;
    const bw = slot * 0.56;
    data.bars.forEach((b, i) => {
      const cx = plotX + slot * i + (slot - bw) / 2;
      if (b.empty) {
        const gh = plotH * 0.32;
        ctx.fillStyle = '#ebe2cf';
        roundRect(ctx, cx, baseY - gh, bw, gh, 6);
        ctx.fill();
        ctx.fillStyle = '#92806d';
        ctx.font = `600 16px ${SERIF}`;
        ctx.textAlign = 'center';
        ctx.fillText('未记', cx + bw / 2, baseY - gh / 2 + 6);
        ctx.textAlign = 'left';
      } else {
        const bh = (b.kcal / yMax) * plotH;
        const parts: Array<[number, string]> = [
          [b.share?.carbs ?? 1, '#6cb1a4'],
          [b.share?.fat ?? 0, '#e89d42'],
          [b.share?.protein ?? 0, '#85bb6b'],
        ];
        let acc = 0;
        for (const [v, col] of parts) {
          if (v <= 0.002) continue;
          const sh2 = bh * v;
          ctx.fillStyle = col;
          ctx.fillRect(cx, baseY - acc - sh2, bw, sh2 + 0.6);
          acc += sh2;
        }
        ctx.textAlign = 'center';
        ctx.fillStyle = b.today ? '#b44324' : '#665545';
        ctx.font = `700 18px ${MONO}`;
        ctx.fillText(fmt(b.kcal), cx + bw / 2, baseY - bh - 10);
        ctx.textAlign = 'left';
      }
      ctx.textAlign = 'center';
      ctx.fillStyle = b.today ? '#b44324' : '#8d7b68';
      ctx.font = `700 18px ${SERIF}`;
      ctx.fillText(b.dayLbl, cx + bw / 2, baseY + 26);
      ctx.textAlign = 'left';
    });
  }

  const barTop = cardBottom - 118;
  const sigBase = cardBottom - 36;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  // 餐/日视图：热量大字 + 明细列表
  if (!data.bars) {
    ctx.fillStyle = '#33261b';
    ctx.font = `800 62px ${SERIF}`;
    const kt = fmt(data.kcal);
    ctx.fillText(kt, inX + 6, cursorY + 62);
    const kw = ctx.measureText(kt).width;
    ctx.font = `600 25px ${SERIF}`;
    ctx.fillStyle = '#8d7b68';
    ctx.fillText(`千卡${data.todo ? `（含 ${data.todo} 道待估）` : ''}`, inX + kw + 30, cursorY + 62);
    crayonRing(ctx, inX + 6 + kw * 0.5, cursorY + 42, kw * 0.5 + 14, 34);
    cursorY += 90;

    const rowsAvail = Math.floor((barTop - 22 - cursorY) / 40);
    const items = data.items ?? [];
    items.slice(0, Math.max(1, Math.min(4, rowsAvail))).forEach((it) => {
      ctx.textAlign = 'left';
      ctx.fillStyle = '#33261b';
      ctx.font = `600 25px ${SERIF}`;
      ctx.fillText(it.name, inX, cursorY + 26);
      ctx.textAlign = 'right';
      ctx.fillStyle = '#385e33';
      ctx.fillText(it.kcal != null ? `${fmt(it.kcal)} 千卡` : '待估算', inX + inW, cursorY + 26);
      cursorY += 38;
    });
  }

  // 三大营养素供能占比
  const pm = Math.round((data.share?.protein ?? 0) * 100);
  const fm = Math.round((data.share?.fat ?? 0) * 100);
  const cm = Math.max(0, 100 - pm - fm);
  ctx.font = `600 21px ${MONO}`;
  ctx.fillStyle = '#665545';
  ctx.textAlign = 'left';
  ctx.fillText(data.share ? `蛋白 ${pm}%` : '蛋白 —', inX, barTop - 12);
  ctx.textAlign = 'center';
  ctx.fillText(data.share ? `脂肪 ${fm}%` : '脂肪 —', inX + inW / 2, barTop - 12);
  ctx.textAlign = 'right';
  ctx.fillText(data.share ? `碳水 ${cm}%` : '碳水 —', inX + inW, barTop - 12);
  drawStackBar(ctx, inX, barTop, inW, 20, data.share, 8);

  // 签名 + 印章
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#665545';
  ctx.font = `500 24px ${SERIF}`;
  ctx.fillText(data.caption, inX, sigBase);
  inkStamp(ctx, inX + inW - 42, sigBase - 22, 34);

  // 页脚
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#8d7b68';
  ctx.font = `600 20px ${MONO}`;
  ctx.fillText('记录仅存于本机 · 卡路里拍立得', P, H - 46);
  ctx.textAlign = 'right';
  ctx.fillText(`${data.kicker}明信片`, W - P, H - 46);
}

/**
 * 生成 PNG 并触发下载。浏览器拦截 a.click() 或 toDataURL 抛错时返回 false，
 * 由调用方显示「长按预览图保存」的降级提示。
 */
export function downloadShare(canvas: HTMLCanvasElement): boolean {
  try {
    const url = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = `caloriesnap-${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    return true;
  } catch {
    return false;
  }
}


