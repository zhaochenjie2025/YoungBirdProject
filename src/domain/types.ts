// S39O-cs-types: 全项目共用的数据模型契约，领域层/存储层/UI 层都只依赖这里。
// 实现 菜品、份量、餐食、条目、营养值、当日/周统计的类型定义。
// 原理 营养值一律可空，用 null 表示「暂无数据」而非 0，避免缺失与真实零值混淆。
// 这也是「待估算」状态能在类型层面被强制处理、不会被漏算的原因。

/** 一份营养值。字段为 null 表示该项数据缺失，不得用 0 代替。 */
export interface Nutrition {
  kcal: number | null;
  protein: number | null;
  fat: number | null;
  carbs: number | null;
}

/** 份量选项，如「半份」「标准份」；grams 是食用部分估重。 */
export interface PortionOption {
  /** 稳定键，用于存储与比对，勿随意改名。 */
  key: string;
  /** 界面上显示的份量名。 */
  label: string;
  /** 该份量对应的食用部分克数。 */
  grams: number;
}

/** 数据出处，用于在结果页展示估算依据。 */
export interface Source {
  /** 来源名称，如「中国食物成分表 第6版」「团队称重样本 2026-11」。 */
  name: string;
  /** 可追溯链接，可为空。 */
  url?: string;
  /** 补充说明，如「食堂实际配方未取得，采用近似条目」。 */
  note?: string;
}

/** 菜品库条目。 */
export interface Dish {
  /** 稳定 ID，小写短横线，用作存储键与识别返回值的锚点。 */
  id: string;
  /** 标准菜名。 */
  name: string;
  /** 常用别名，供搜索匹配。 */
  aliases: string[];
  /** 烹饪方式，如「炒」「炖」「蒸」。 */
  cooking: string;
  /** 类别，用于膳食建议判断，如「蔬菜」「荤菜」「主食」「汤」。 */
  category: DishCategory;
  /** 每 100 克食用部分的营养值。 */
  per100g: Nutrition;
  /** 营养数据出处。 */
  source: Source;
  /** 可选份量列表，至少含一个标准份。 */
  portions: PortionOption[];
  /** 份量数据出处。 */
  portionSource: Source;
  /** 热量上下限（千卡），有依据时填写，用于结果页给区间。 */
  kcalRange?: [number, number];
  /** 差异来源说明，如「份量、用油量或配方」。 */
  rangeNote?: string;
}

export type DishCategory = '蔬菜' | '荤菜' | '主食' | '汤' | '蛋豆' | '其他';

/** 餐次。 */
export type MealSlot = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export const MEAL_SLOT_LABEL: Record<MealSlot, string> = {
  breakfast: '早餐',
  lunch: '午餐',
  dinner: '晚餐',
  snack: '加餐',
};

/** 餐食中的一道菜。营养值是保存时的快照，菜品库后续变动不影响历史记录。 */
export interface MealItem {
  /** 条目唯一 ID。 */
  uid: string;
  /** 菜品库 ID；菜品库外的自定义菜为 null。 */
  dishId: string | null;
  /** 记录时显示的菜名快照。 */
  name: string;
  /** 实际吃下的克数。 */
  grams: number;
  /** 份量选项的显示名，如「半份」；自定义克数时为「自定义」。 */
  portionLabel: string;
  /** 是否为待估算（营养数据缺失）。 */
  pending: boolean;
  /** 计算结果的快照。 */
  nutrition: Nutrition;
}

/** 一条餐食记录。 */
export interface Meal {
  id: string;
  /** 就餐日期，YYYY-MM-DD（本地时区）。 */
  date: string;
  /** 就餐时间，HH:mm。 */
  time: string;
  slot: MealSlot;
  items: MealItem[];
  createdAt: string;
  updatedAt: string;
}

/** 一餐或多餐的汇总。pendingCount 为待估算条目数。 */
export interface MealSummary {
  kcal: number;
  protein: number | null;
  fat: number | null;
  carbs: number | null;
  pendingCount: number;
  itemCount: number;
}

/** 单日统计。meals 为空时 logged=false。 */
export interface DayStats {
  date: string;
  logged: boolean;
  kcal: number;
  protein: number | null;
  fat: number | null;
  carbs: number | null;
  pendingCount: number;
  mealCount: number;
}

/** 周视图的一个格子。 */
export interface WeekCell extends DayStats {
  /** 该日是否完全不完整（有待估算条目）。 */
  incomplete: boolean;
}
