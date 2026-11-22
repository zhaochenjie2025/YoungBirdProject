#!/usr/bin/env python3
# S39O-cs-eval-usage: 使用效率评测，算任务完成率与成功任务的中位用时，对齐 PRD 第四章指标。
# 实现 读测试记录表 CSV，统计完成率、成功任务用时中位数，并判断是否达标。
# 原理 PRD 明确「成功任务从新建到保存的中位用时」，故中位数只取成功样本、未完成只进完成率分母，
# 否则失败任务的异常用时会把中位数带偏。
import csv
import statistics
import sys

TARGET_RATE = 90.0
TARGET_MEDIAN = 60.0
MIN_SUBJECTS = 15

USAGE = """用法:
  python3 tools/eval-usage.py <记录表.csv>

CSV 列（表头固定）:
  编号,完成,用时,拍照道数,搜索道数,失败原因,备注
  - 完成: Y 或 N
  - 用时: 秒，失败时留空
"""


def main():
    if len(sys.argv) < 2:
        print(USAGE)
        sys.exit(2)
    path = sys.argv[1]
    rows = []
    with open(path, encoding='utf-8-sig') as f:
        for r in csv.DictReader(f):
            done = str(r.get('完成', '')).strip().upper() == 'Y'
            secs = None
            if done and str(r.get('用时', '')).strip():
                try:
                    secs = float(r['用时'])
                except ValueError:
                    secs = None
            rows.append((r.get('编号', '?'), done, secs, r.get('失败原因', '').strip()))

    total = len(rows)
    if total == 0:
        print('记录表是空的。')
        sys.exit(1)

    done_rows = [r for r in rows if r[1]]
    rate = len(done_rows) / total * 100
    times = [r[2] for r in done_rows if r[2] is not None]

    print(f'受试者 {total} 人，完成 {len(done_rows)} 人，完成率 {rate:.1f}%（目标 ≥ {TARGET_RATE:.0f}%）')
    if times:
        med = statistics.median(times)
        mean = statistics.mean(times)
        print(f'成功任务用时：中位数 {med:.1f} 秒 / 平均 {mean:.1f} 秒（目标中位 ≤ {TARGET_MEDIAN:.0f} 秒）')
    else:
        print('没有记录到成功的用时，无法判断中位用时。')

    failed = [r for r in rows if not r[1]]
    if failed:
        print('\n未完成的受试者：')
        for no, _, _, reason in failed:
            print(f'  - {no}: {reason or "(未填写原因)"}')

    print()
    ok_rate = rate >= TARGET_RATE
    ok_time = bool(times) and statistics.median(times) <= TARGET_MEDIAN
    print(f'完成率 {"达标" if ok_rate else "未达标"}；中位用时 {"达标" if ok_time else "未达标"}')
    if total < MIN_SUBJECTS:
        print(f'注意：PRD 要求不少于 {MIN_SUBJECTS} 名受试者，当前只有 {total} 名。')


if __name__ == '__main__':
    main()
