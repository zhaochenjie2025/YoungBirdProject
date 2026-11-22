#!/usr/bin/env python3
# S39O-cs-eval-calorie: 热量估算误差评测，算出单餐 MAPE，对齐 PRD 第四章的热量指标。
# 实现 读参考餐食表（实测重量 + 配方算出的真实热量）与用户记录结果，逐餐算绝对百分比误差并汇总。
# 原理 PRD 要求「用户通过日常份量选项完成记录，实测重量和配方用于计算参考值」，
# 所以误差的分母是参考值而非估算值；用 MAPE 而不是平均绝对误差，避免大份餐食主导结果。
import csv
import json
import statistics
import sys

USAGE = """用法:
  python3 tools/eval-calorie.py <参考表.csv> <记录导出.json>

参考表 CSV 列:
  meal_id,ref_kcal,estimated_kcal
  - meal_id: 餐食编号，同一餐多道菜时用同一编号
  - ref_kcal: 按实测重量与配方算出的真实热量（千卡）
  - estimated_kcal: 用本应用通过日常份量选项记录后得到的估算热量

记录导出 JSON 也支持（从应用「历史」页导出的格式），此时从 items 汇总 kcal。
"""


def load_ref(path):
    rows = []
    with open(path, encoding='utf-8-sig') as f:
        for r in csv.DictReader(f):
            rows.append((r['meal_id'], float(r['ref_kcal']), float(r['estimated_kcal'])))
    return rows


def load_export(path):
    data = json.load(open(path, encoding='utf-8'))
    out = []
    for m in data.get('meals', []):
        ref = m.get('referenceKcal')
        if ref is None:
            continue
        est = sum(it['nutrition']['kcal'] for it in m['items'] if it.get('nutrition', {}).get('kcal') is not None)
        out.append((m['id'], float(ref), float(est)))
    return out


def main():
    if len(sys.argv) < 3:
        print(USAGE)
        sys.exit(2)
    ref_path, est_path = sys.argv[1], sys.argv[2]

    refs = load_ref(ref_path) if ref_path.endswith('.csv') else load_export(ref_path)
    ext = load_export(est_path) if est_path.endswith('.json') else load_ref(est_path)

    # 按 meal_id 对齐，只统计两边都有的
    ext_map = {mid: est for mid, _, est in ext}
    pairs = [(mid, ref, ext_map[mid]) for mid, ref, _ in refs if mid in ext_map]

    if not pairs:
        print('没有能对齐的餐食：参考表与记录里的 meal_id 对不上。')
        sys.exit(1)

    apes = []
    print(f"{'餐食':<12}{'参考':>8}{'估算':>8}{'绝对误差%':>12}")
    print('-' * 42)
    for mid, ref, est in pairs:
        if ref <= 0:
            continue
        ape = abs(est - ref) / ref * 100
        apes.append(ape)
        print(f'{mid:<12}{ref:>8.0f}{est:>8.0f}{ape:>11.1f}%')

    mape = statistics.mean(apes)
    print('-' * 42)
    print(f'样本 {len(apes)} 份  平均绝对百分比误差（MAPE）= {mape:.1f}%')
    print(f'PRD 目标 ≤ 25%　→　{"达标" if mape <= 25 else "未达标"}')
    if len(apes) < 60:
        print(f'注意：PRD 要求不少于 60 份参考餐食，当前只有 {len(apes)} 份。')


if __name__ == '__main__':
    main()
