#!/usr/bin/env python3
# S39O-cs-fetchtest: 采集网络图片做识别测试集，把图与标注写在同一个分组文件里。
# 实现 按关键词向 Wikimedia Commons 搜索图片，下载 512 长边缩略图，生成 labels.json。
# 原理 真实食堂数据尚未采集，先用公开图片验证「封闭选择」链路是否走得通；
# 同一关键词的图归入同一分组，避免同源图片同时进训练与测试造成虚高。
import json
import os
import subprocess
import sys
import urllib.parse

OUT = sys.argv[1] if len(sys.argv) > 1 else 'data/vision-test'
IMG_DIR = os.path.join(OUT, 'img')
os.makedirs(IMG_DIR, exist_ok=True)

API = 'https://commons.wikimedia.org/w/api.php'


def proxied(args, **kw):
    # 该站点在本机被墙，统一走 s39o-proxy
    return subprocess.run(['s39o-proxy', *args], **kw)


def search(term, limit=3):
    q = urllib.parse.urlencode(
        {
            'action': 'query',
            'generator': 'search',
            'gsrsearch': term,
            'gsrnamespace': 6,
            'gsrlimit': limit,
            'prop': 'imageinfo',
            'iiprop': 'url',
            'iiurlwidth': 512,
            'format': 'json',
        }
    )
    r = proxied(
        ['curl', '-sSL', '-m', '40', f'{API}?{q}', '-H', 'User-Agent: CalorieSnapTest/0.1'],
        capture_output=True,
        text=True,
    )
    try:
        data = json.loads(r.stdout)
    except json.JSONDecodeError:
        return []
    pages = data.get('query', {}).get('pages', {})
    urls = []
    for p in pages.values():
        ii = p.get('imageinfo')
        if ii and ii[0].get('thumburl'):
            urls.append((p['title'], ii[0]['thumburl'].split('?')[0]))
    return urls


def download(url, path):
    r = proxied(
        ['curl', '-sSL', '-m', '50', '-o', path, url],
        capture_output=True,
        text=True,
    )
    return r.returncode == 0 and os.path.getsize(path) > 5000


def main():
    plan_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'vision-test-plan.json')
    with open(plan_path, encoding='utf-8') as f:
        plan = json.load(f)

    labels = []
    for group in plan:
        dish_id = group['dishId']
        term = group['searchTerm']
        got = search(term, limit=group.get('count', 3))
        if not got:
            print(f'[skip] {dish_id}: 搜索无结果')
            continue
        for idx, (title, url) in enumerate(got):
            name = f'{dish_id}-{idx}.jpg'
            path = os.path.join(IMG_DIR, name)
            if download(url, path):
                labels.append(
                    {
                        'file': name,
                        'dishId': dish_id,
                        'group': dish_id,
                        'title': title,
                        'sourceUrl': url,
                        'note': '网络公开图片，仅用于链路验证',
                    }
                )
                print(f'[ok] {name} <- {title}')
            else:
                print(f'[fail] {name}')

    with open(os.path.join(OUT, 'labels.json'), 'w', encoding='utf-8') as f:
        json.dump(labels, f, ensure_ascii=False, indent=2)
    print(f'\n共 {len(labels)} 张，写入 {OUT}/labels.json')


if __name__ == '__main__':
    main()
