// S39O-cs-photos: 菜品展示照片的资源映射表，页面按菜品 ID 取图，缺图时回退到通用占位。
// 实现 把菜品 ID 映射到 public/photos/ 下的 WebP 相对路径；未收录的 ID 返回 null。
// 原理 照片与菜品库解耦：菜品库只描述营养数据，照片可独立替换而不动数据层；
// 图片走独立文件而非内联 base64，避免拖大首屏 JS，并能被浏览器缓存。
const PHOTO_BASE = './photos/';

/**
 * 已配图的菜品 ID。键必须与 dishes.json 的 id 完全一致，否则取图会静默落空。
 * 路径相对文档地址解析；hash 路由不改变文档地址，故配合构建 base './' 在 Pages 子路径下同样成立。
 */
const PHOTO_IDS = [
  'tomato-egg',
  'stir-fried-greens',
  'braised-pork',
  'rice',
  'potato-shreds',
  'kungpao-chicken',
  'mapo-tofu',
  'seaweed-egg-soup',
  'yu-xiang-pork',
  'pepper-pork-shreds',
  'braised-eggplant',
  'tomato-egg-soup',
  'steamed-bun',
  'hua-juan',
  'egg-fried-rice',
  'braised-chicken-leg',
  'braised-spareribs',
  'winter-melon-sparerib-soup',
  'garlic-broccoli',
  'dry-fried-green-beans',
  'sweet-sour-pork',
  'steamed-egg',
  'soy-milk',
  'shredded-cabbage',
] as const;

export type PhotoId = (typeof PHOTO_IDS)[number];

/** 按菜品 ID 取照片地址；无对应照片返回 null，由调用方决定占位样式。 */
export function dishPhoto(id: string | null | undefined): string | null {
  if (!id) return null;
  return (PHOTO_IDS as readonly string[]).includes(id) ? `${PHOTO_BASE}${id}.webp` : null;
}
