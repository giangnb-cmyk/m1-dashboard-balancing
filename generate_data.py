"""
generate_data.py
Đọc tất cả CSV trong thư mục Csv/ và generate ra js/data.js
chứa window.GameData — để dashboard chạy trực tiếp file:// không cần server.

Cách dùng:
  python generate_data.py

Output: js/data.js (tự động overwrite mỗi lần chạy)
"""

import csv
import json
import os
import re

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CSV_DIR  = os.path.join(BASE_DIR, 'Csv')
OUT_FILE = os.path.join(BASE_DIR, 'js', 'data.js')


# ── Fill-down helper ──────────────────────────────────────────────────────────

def fill_down(rows, key_fields):
    last = {}
    result = []
    for row in rows:
        filled = dict(row)
        for k in key_fields:
            if filled.get(k, '') == '':
                filled[k] = last.get(k, '')
            else:
                last[k] = filled[k]
        result.append(filled)
    return result


# ── CSV loader ────────────────────────────────────────────────────────────────

def load_csv(rel_path, key_fields=None):
    """Load one CSV relative to CSV_DIR. Returns list of dicts."""
    full = os.path.join(CSV_DIR, rel_path)
    if not os.path.exists(full):
        print(f'  [SKIP] {rel_path} — not found')
        return []

    # Thử lần lượt các encoding phổ biến
    for enc in ('utf-8-sig', 'utf-16', 'cp1252', 'latin-1'):
        try:
            with open(full, encoding=enc) as f:
                reader = csv.DictReader(f)
                rows = [
                    {k.strip(): v.strip() for k, v in row.items()}
                    for row in reader
                    if any(v.strip() for v in row.values())
                ]
            break  # thành công
        except (UnicodeDecodeError, UnicodeError):
            continue
    else:
        print(f'  [ERROR] Cannot decode {rel_path} — skipped')
        return []

    if key_fields:
        rows = fill_down(rows, key_fields)
    return rows


# ── CSV manifest ──────────────────────────────────────────────────────────────

MANIFEST = {
    # BuildUpGoal
    'buildUpGoalData':         ('Core/BuildUpGoal/BuildUpGoalData.csv',        ['theme']),
    'buildUpGoalReward':       ('Core/BuildUpGoal/BuildUpGoalReward.csv',       ['theme_type']),
    'buildUpGoalRewardBonus':  ('Core/BuildUpGoal/BuildUpGoalRewardBonus.csv',  ['type', 'index']),

    # ItemIdentify
    'itemGenerator':           ('Core/ItemIdentify/ItemGenerator.csv',          ['type']),
    'itemRaw':                 ('Core/ItemIdentify/ItemRaw.csv',                ['type']),
    'itemTool':                ('Core/ItemIdentify/ItemTool.csv',               ['type']),
    'itemBooster':             ('Core/ItemIdentify/ItemBooster.csv',            ['type']),
    'itemChest':               ('Core/ItemIdentify/ItemChest.csv',              None),
    'itemFood':                ('Core/ItemIdentify/ItemFood.csv',               ['type']),
    'itemCurrency':            ('Core/ItemIdentify/ItemCurrency.csv',           ['type']),

    # Generators
    'rateGenerator':           ('Core/Generators/RateGenerator.csv',            ['type', 'id']),
    'dynamicGeneratorSpawning':('Core/Generators/DynamicGeneratorSpawning.csv', ['item_save_type']),

    # ItemExpand
    'itemExpand':              ('Core/ItemExpand.csv',                          ['type', 'id']),

    # Orders
    'orderDetail':             ('Core/Order/OrderDetail.csv',                   None),
    'orderSystem':             ('Core/Order/OrderSystem.csv',                   None),
    'orderDetailReward':       ('Core/Order/OrderDetailReward.csv',             ['theme_type']),
    'orderGold':               ('Core/Order/OrderGold.csv',                     None),
    'orderSystemReward':       ('Core/Order/OrderSystemReward.csv',             ['theme_type']),
    'rewardMinDistribute':     ('Core/Order/RewardMinDistributeOrderDetail.csv',None),

    # Recipes
    'formuaRecipes':           ('Core/Recipes/FormulaRecipes.csv',              None),

    # Box & Gift
    'itemBoxGenerator':        ('Core/Box&Gift/ItemBoxGenerator.csv',           ['item_save_type','id_item','many_generator','time_unlock']),
    'itemAssistantsChest':     ('Core/Box&Gift/ItemAssistantsChest.csv',        ['item_save_type','id_item','many_generator','time_unlock']),
    'itemChefsChest':          ('Core/Box&Gift/ItemChefsChest.csv',             ['item_save_type','id_item','many_generator','time_unlock']),
    'itemCoinBox':             ('Core/Box&Gift/ItemCoinBox.csv',                ['item_save_type','id_item','many_generator','time_unlock']),
    'itemDailyGift':           ('Core/Box&Gift/ItemDailyGift.csv',              ['item_save_type','id_item','many_generator','time_unlock']),
    'itemEquipmentBox':        ('Core/Box&Gift/ItemEquipmentBox.csv',           ['item_save_type','id_item','many_generator','time_unlock']),
    'itemFlushGift':           ('Core/Box&Gift/ItemFlushGift.csv',              ['item_save_type','id_item','many_generator','time_unlock']),
    'itemGift':                ('Core/Box&Gift/ItemGift.csv',                   ['item_save_type','id_item','many_generator','time_unlock']),
    'itemLuckyBox':            ('Core/Box&Gift/ItemLuckyBox.csv',               ['item_save_type','id_item','many_generator','time_unlock']),
    'itemLuckyHandbag':        ('Core/Box&Gift/ItemLuckyHandbag.csv',           ['item_save_type','id_item','many_generator','time_unlock']),
    'itemTraineeBox':          ('Core/Box&Gift/ItemTraineeBox.csv',             ['item_save_type','id_item','many_generator','time_unlock']),

    # Features
    'buyCurrency':             ('Features/BuyCurrency/BuyCurrency.csv',         None),
    'chefsBookData':           ('Features/ChefsBook/ChefsBookData.csv',         ['chefs_type']),

    # Extends
    'convertTime':             ('Extends/ConvertTime/ConvertTimeTool.csv',       None),
}

BOX_KEYS = {
    'itemBoxGenerator', 'itemAssistantsChest', 'itemChefsChest',
    'itemCoinBox', 'itemDailyGift', 'itemEquipmentBox', 'itemFlushGift',
    'itemGift', 'itemLuckyBox', 'itemLuckyHandbag', 'itemTraineeBox',
}


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    print('Generating js/data.js ...')
    data = {}
    for key, (rel_path, key_fields) in MANIFEST.items():
        rows = load_csv(rel_path, key_fields)
        data[key] = rows
        print(f'  {key}: {len(rows)} rows')

    # Build boxes sub-object (mirrors CsvLoader structure)
    boxes = {k: data.pop(k) for k in BOX_KEYS}
    data['boxes'] = boxes

    # Serialize
    json_str = json.dumps(data, ensure_ascii=False, indent=None, separators=(',', ':'))

    js_content = f"""/**
 * data.js — Auto-generated by generate_data.py
 * DO NOT EDIT manually. Re-run: python generate_data.py
 *
 * Contains window.GameData with all CSV data pre-parsed.
 * Allows dashboard to run via file:// without a server.
 */
window.GameData = {json_str};
"""

    os.makedirs(os.path.join(BASE_DIR, 'js'), exist_ok=True)
    with open(OUT_FILE, 'w', encoding='utf-8') as f:
        f.write(js_content)

    size_kb = os.path.getsize(OUT_FILE) / 1024
    print(f'\nDone! js/data.js — {size_kb:.1f} KB')
    print('Mở index.html trực tiếp trong trình duyệt là dùng được.')


if __name__ == '__main__':
    main()
