"""
generate_data.py
Đọc tất cả CSV trong thư mục Csv/ và generate ra js/data/ (nhiều file nhỏ).
Mỗi file tương ứng một domain, cùng merge vào window.GameData.

Cách dùng:
  python generate_data.py

Output: js/data/*.js (tự động overwrite mỗi lần chạy)
"""

import csv
import io
import json
import os
import sys

sys.stdout.reconfigure(encoding='utf-8')

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CSV_DIR  = os.path.join(BASE_DIR, 'Csv')
OUT_DIR  = os.path.join(BASE_DIR, 'js', 'data')

ITEM_TYPE_MAP = {
    '1': 'Generator',
    '2': 'Tool',
    '3': 'Currency',
    '4': 'Recipe',
    '5': 'Booster',
    '7': 'Raw',
}


# ── Helpers ───────────────────────────────────────────────────────────────────

_LOCALIZED_NAMES = None


def localized_names():
    """id → tên item sạch từ Csv/Localize/en/item.csv (định dạng key~value, khoá `{id}_name`).

    Nguồn CSV ItemMerge có cột name_item bị corrupt ("Coffee"→"falseffee"); bản localize
    này là nguồn tên chuẩn (giống runtime `Utils.GetNameItems`). Cache sau lần đọc đầu."""
    global _LOCALIZED_NAMES
    if _LOCALIZED_NAMES is not None:
        return _LOCALIZED_NAMES
    _LOCALIZED_NAMES = {}
    full = os.path.join(CSV_DIR, 'Localize', 'en', 'item.csv')
    if not os.path.exists(full):
        print('  [WARN] Localize/en/item.csv not found — tên item có thể bị lỗi')
        return _LOCALIZED_NAMES
    with io.open(full, encoding='utf-8-sig') as f:
        for line in f:
            key, sep, value = line.rstrip('\r\n').partition('~')
            if sep and key.endswith('_name'):
                _LOCALIZED_NAMES[key[:-len('_name')]] = value
    return _LOCALIZED_NAMES


def clean_name(item_id, fallback=''):
    """Tên sạch theo id, fallback về tên gốc nếu localize không có."""
    return localized_names().get(item_id) or fallback


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


def load_csv(rel_path, key_fields=None):
    full = os.path.join(CSV_DIR, rel_path)
    if not os.path.exists(full):
        print(f'  [SKIP] {rel_path} — not found')
        return []
    for enc in ('utf-8-sig', 'utf-16', 'cp1252', 'latin-1'):
        try:
            with open(full, encoding=enc) as f:
                # Một số file export từ Unity có dòng trống trước header — bỏ đi
                # để DictReader không lấy nhầm dòng trống làm header.
                text = f.read().lstrip('﻿\r\n')
                reader = csv.DictReader(io.StringIO(text))
                # k=None: row thừa cột so với header (DictReader gom vào list) — bỏ qua.
                # v=None: row thiếu cột — coi như ''.
                rows = [
                    {k.strip(): (v or '').strip() for k, v in row.items() if k is not None}
                    for row in reader
                    if any((v or '').strip() for v in row.values() if isinstance(v, str))
                ]
            break
        except (UnicodeDecodeError, UnicodeError):
            continue
    else:
        print(f'  [ERROR] Cannot decode {rel_path} — skipped')
        return []
    if key_fields:
        rows = fill_down(rows, key_fields)
    return rows


TOOL_NAMES = {'2001': 'Juicer', '2002': 'Chef Counter', '2003': 'Grill', '2004': 'Pan', '2005': 'Oven', '700402': 'Glass Bowl'}


def norm_time(raw):
    """Normalize VN decimal separator: '2,5' → '2.5'."""
    return (raw or '').replace(',', '.')


def parse_cooking_recipes(rel_path):
    """Parse CookingRecipes.csv (fill-down, multi-row per recipe) into recipe objects
    with compat keys: itemID/tool(name)/cooking_time(normalized)/ingredients + Ingredient{1..4}Id."""
    raw = load_csv(rel_path, ['type_tool', 'id_result', 'time_to_cook'])
    grouped = {}
    order = []
    for r in raw:
        rid = r.get('id_result', '')
        if not rid:
            continue
        if rid not in grouped:
            tool_id   = r.get('type_tool', '')
            tool_name = TOOL_NAMES.get(tool_id, tool_id)
            time      = norm_time(r.get('time_to_cook', ''))
            grouped[rid] = {
                'itemID':         rid,
                'tool':           tool_name,
                'toolId':         tool_id,
                'cooking_time':   time,
                'ResultId':       rid,
                'TypeTool':       tool_name,
                'TimeToCook_sec': time,
                '_ings': [],
            }
            order.append(rid)
        item_id = r.get('item_id', '')
        if item_id:
            grouped[rid]['_ings'].append(item_id)
    out = []
    for rid in order:
        rec = grouped[rid]
        ings = rec.pop('_ings')
        rec['ingredients'] = ','.join(ings)
        for i in range(4):
            rec[f'Ingredient{i + 1}Id']   = ings[i] if i < len(ings) else ''
            rec[f'Ingredient{i + 1}Type'] = ''
        out.append(rec)
    return out


def inject_item_type(rows):
    for row in rows:
        item_id = row.get('itemID', '')
        row['type'] = ITEM_TYPE_MAP.get(item_id[:1], 'Unknown') if item_id else 'Unknown'
    return rows


def write_data_file(filename, keys_data, label):
    """Write one js/data/<filename>.js file merging keys into window.GameData."""
    json_str = json.dumps(keys_data, ensure_ascii=False, separators=(',', ':'), indent=2)
    content = f"""// {label} — Auto-generated by generate_data.py. DO NOT EDIT manually.
Object.assign(window.GameData, {json_str});
"""
    path = os.path.join(OUT_DIR, filename)
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)
    size_kb = os.path.getsize(path) / 1024
    total = sum(len(v) if isinstance(v, list) else sum(len(x) for x in v.values()) for v in keys_data.values())
    print(f'  → {filename}: {size_kb:.0f} KB  ({total} rows across {len(keys_data)} keys)')


# ── Domain manifests ──────────────────────────────────────────────────────────

def parse_board_default(rel_path):
    """Parse Unity BoardDefault.asset (YAML ScriptableObject) into a list of
    {idItem, x, y} dicts representing the initial board state.

    Each entry in the asset looks like:
        - ItemSave:
            itemSaveType: 0
            idItem: 701301
          Position:
            x: 0
            y: 0
    """
    import re
    full = os.path.join(CSV_DIR, rel_path)
    if not os.path.exists(full):
        print(f'  [SKIP] {rel_path} — not found')
        return []

    with open(full, encoding='utf-8') as f:
        content = f.read()

    # idItem immediately followed by Position block (no other fields between them)
    pattern = re.compile(
        r'idItem:\s*(\d+)\s*\n'
        r'\s*Position:\s*\n'
        r'\s*x:\s*(\d+)\s*\n'
        r'\s*y:\s*(\d+)'
    )
    items = []
    for m in pattern.finditer(content):
        items.append({
            'idItem': m.group(1),
            'x':      int(m.group(2)),
            'y':      int(m.group(3)),
        })
    # Keep only generators (1xxxxx) and tools (2xxxxx); drop loose merge items (7xxxxx)
    items = [i for i in items if i['idItem'].startswith(('1', '2'))]
    print(f'    BoardDefault: {len(items)} generator/tool slots parsed from {rel_path}')
    return items


def parse_item_expand(rel_path):
    """Parse ItemExpand.csv — tự detect schema theo tên cột spawn.
    Schema chuẩn:   itemID, spawn_itemID, spawn_number, time_cooldown, cost_energy
    Schema Unity 2: id, id_item_expand, time_cooldown, cost_energy, skip_res_*
    Schema Unity 1: type, id, item_save_type, id_item, time_cooldown, cost_energy
    Output luôn dùng schema chuẩn để JS code đọc nhất quán.
    """
    rows = load_csv(rel_path)
    if not rows:
        return []
    first = rows[0]
    # Detect schema chuẩn
    if 'itemID' in first and 'spawn_itemID' in first:
        return rows  # đã đúng schema chuẩn
    spawn_key = 'id_item_expand' if 'id_item_expand' in first else 'id_item'
    # Convert schema Unity → chuẩn, fill-down id
    result = []
    last_id = ''
    for r in rows:
        item_id    = r.get('id', '').strip() or last_id
        last_id    = item_id or last_id
        spawn_id   = r.get(spawn_key, '').strip()
        if not spawn_id:
            continue
        result.append({
            'itemID':       item_id,
            'spawn_itemID': spawn_id,
            'spawn_number': '1',
            'time_cooldown': r.get('time_cooldown', '').strip(),
            'cost_energy':   r.get('cost_energy', '').strip(),
        })
    return result


def parse_item_data_from_merge(rel_path):
    """Generate itemData from ItemMerge.csv + ItemData.csv.
    ItemMerge.csv: name, can_merge, sell_price, sum_merge.
    ItemData.csv:  energy_cost, time_point (joined by itemID)."""
    # Load energy/time lookup from ItemData.csv
    energy_map = {}
    for r in load_csv('Core/ItemIdentify/ItemData.csv'):
        iid = r.get('itemID', '')
        if iid:
            energy_map[iid] = {
                'energy_cost': r.get('energy_cost', '0'),
                'time_point':  r.get('time_point', '0'),
            }

    rows = load_csv(rel_path)
    result = []
    for r in rows:
        item_id = r.get('id', '')
        if not item_id:
            continue
        tier = int(item_id[-2:]) if len(item_id) >= 2 and item_id[-2:].isdigit() else 0
        extra = energy_map.get(item_id, {'energy_cost': '0', 'time_point': '0'})
        result.append({
            'itemID':      item_id,
            'name_item':   clean_name(item_id, r.get('name_item', '')),
            'can_merge':   r.get('can_merge', ''),
            'sell_price':  r.get('sell_price', ''),
            'sum_merge':   r.get('sum_merge', ''),
            'tier':        str(tier),
            'energy_cost': extra['energy_cost'],
            'time_point':  extra['time_point'],
        })
    return inject_item_type(result)


def load_item_merge_clean():
    """ItemMerge.csv raw, nhưng sửa cột name_item bằng tên localize sạch."""
    rows = load_csv('Core/ItemIdentify/ItemMerge.csv')
    for r in rows:
        if r.get('id'):
            r['name_item'] = clean_name(r['id'], r.get('name_item', ''))
    return rows


def load_items():
    return {
        'itemData':      parse_item_data_from_merge('Core/ItemIdentify/ItemMerge.csv'),
        'itemCurrency':  load_csv('Core/ItemIdentify/ItemCurrency.csv'),
        'itemMerge':     load_item_merge_clean(),
        'itemExpand':    parse_item_expand('Core/ItemExpand/ItemExpand.csv'),
        'formuaRecipes': parse_cooking_recipes('Core/Recipes/CookingRecipes.csv'),
        'boardDefault':  parse_board_default('SO/BoardDefault.asset'),
    }


# Maps first 4 digits of generator id → generator type name (derived from MergeItemTypes enum)
# id scheme: 100104 → prefix "1001" → DrinkGenerator (enum DrinkGenerator=1001)
GEN_ID_4PREFIX_TO_TYPE = {
    '1001': 'DrinkGenerator',
    '1002': 'FruitAndSugarGenerator',
    '1003': 'ProteinGenerator',
    '1004': 'VegetableGenerator',
    '1005': 'SeafoodGenerator',
    '1006': 'GrainGenerator',
    '1007': 'AlcoholGenerator',
    '1740': 'VegetableGenerator',
    '2050': 'SeafoodGenerator',
    '2560': 'GrainGenerator',
    '2870': 'AlcoholGenerator',
    '3590': 'FrenchRecipeBook',
    '3830': 'JapaneseAttraction',
    '3840': 'JapaneseAttraction',
    '4090': 'JapaneseRecipeBook',
    '5290': 'ChineseRecipeBook',
    '5990': 'SpanishRecipeBook',
    '6150': 'CraftToolStorage',
}


def infer_gen_type(rid):
    """Infer generator type from first 4 digits of id using MergeItemTypes enum mapping."""
    prefix = rid[:4]
    return GEN_ID_4PREFIX_TO_TYPE.get(prefix, '')


_GEN_FILL_FIELDS = ['id', 'time_cooldown', 'cost_energy', 'min_count', 'max_count', 'deduct_rate', 'gem_to_min']


def parse_item_generator(rel_path):
    """Parse ItemGenerator.csv (sparse rows: config fields only on first row per generator).
    Fill-down all config fields so every spawn row carries full generator context."""
    raw = load_csv(rel_path, _GEN_FILL_FIELDS)
    result = []
    for row in raw:
        r = dict(row)
        r['type'] = infer_gen_type(r.get('id', ''))
        result.append(r)
    return result


def load_generators():
    return {
        'rateGenerator':            parse_item_generator('Core/Generators/ItemGenerator.csv'),
        'dynamicGeneratorSpawning': load_csv('Core/Generators/DynamicGeneratorSpawning.csv', ['item_save_type']),
        'itemGenerator':            load_csv('Core/Generators/ItemGenerator.csv', _GEN_FILL_FIELDS),
    }


def parse_order_detail(rel_path, item_names):
    """Parse OrderDetail.csv (multi-row per order) into flat rows with item1/item2 fields.
    item_names: dict id -> name from ItemMerge.csv.
    Each order's first row may carry a custom_value reward item (tool/generator/item given
    upon completing the order); this is captured as rw_item_id / rw_item_number."""
    raw = load_csv(rel_path, ['order_id', 'id_npc'])
    grouped = {}
    order_list = []
    for row in raw:
        oid = row.get('order_id', '')
        if not oid:
            continue
        if oid not in grouped:
            grouped[oid] = {'orderId': oid, 'idNPC': row.get('id_npc', ''),
                            'items': [], 'gold': row.get('res_number', ''),
                            'rwItemId': '', 'rwItemQty': '1'}
            order_list.append(oid)
        item_id = row.get('item_id', '')
        if item_id:
            grouped[oid]['items'].append({
                'id': item_id,
                'amount': row.get('amount', '1'),
                'name': item_names.get(item_id, ''),
            })
        # Capture reward item: custom_value carries the item ID when res_type=Item
        cv = row.get('custom_value', '')
        rt = row.get('res_type', '')
        rn = row.get('res_number', '')
        if cv and rt == 'Item':
            grouped[oid]['rwItemId']  = cv
            grouped[oid]['rwItemQty'] = rn or '1'
        elif cv and not grouped[oid]['rwItemId']:
            # Fallback: plain custom_value without explicit res_type=Item
            grouped[oid]['rwItemId']  = cv
            grouped[oid]['rwItemQty'] = rn or '1'
    out = []
    for oid in order_list:
        o = grouped[oid]
        items = o['items']
        i1 = items[0] if len(items) > 0 else {}
        i2 = items[1] if len(items) > 1 else {}
        out.append({
            'orderId':        oid,
            'idNPC':          o['idNPC'],
            'item1_id':       i1.get('id', ''),
            'item1_name':     i1.get('name', ''),
            'item1_amount':   i1.get('amount', ''),
            'item2_id':       i2.get('id', ''),
            'item2_name':     i2.get('name', ''),
            'item2_amount':   i2.get('amount', ''),
            'gold':           o['gold'],
            'rw_item_id':     o['rwItemId'],
            'rw_item_number': o['rwItemQty'],
        })
    return out


def parse_order_system(rel_path):
    """Parse OrderSystem.csv (multi-row per batch) into flat batch rows with order1..N and reward1..N."""
    raw = load_csv(rel_path, ['id', 'theme_type', 'can_receive_reward'])
    grouped = {}
    batch_list = []
    for row in raw:
        bid = row.get('id', '')
        if not bid:
            continue
        if bid not in grouped:
            grouped[bid] = {
                'id': bid,
                'themeType': row.get('theme_type', ''),
                'canReceiveReward': '1' if row.get('can_receive_reward', '').upper() == 'TRUE' else '0',
                'orders': [],
                'rewards': [],
            }
            batch_list.append(bid)
        id_order = row.get('id_order', '')
        if id_order:
            grouped[bid]['orders'].append(id_order)
        res_type = row.get('res_type', '')
        res_id   = row.get('res_id', '')
        res_num  = row.get('res_number', '')
        custom   = row.get('custom_value', '')
        if res_type:
            grouped[bid]['rewards'].append({
                'resType': res_type, 'resId': res_id,
                'resNumber': res_num, 'customValue': custom,
            })
    out = []
    for bid in batch_list:
        b = grouped[bid]
        flat = {'id': b['id'], 'themeType': b['themeType'],
                'canReceiveReward': b['canReceiveReward']}
        for i, oid in enumerate(b['orders'], 1):
            flat[f'order{i}_idOrder'] = oid
        for i, r in enumerate(b['rewards'], 1):
            flat[f'reward{i}_resType']    = r['resType']
            flat[f'reward{i}_resId']      = r['resId']
            flat[f'reward{i}_resNumber']  = r['resNumber']
            flat[f'reward{i}_customValue'] = r['customValue']
        out.append(flat)
    return out


def load_orders():
    item_names = {r['id']: clean_name(r['id'], r['name_item'])
                  for r in load_csv('Core/ItemIdentify/ItemMerge.csv')
                  if r.get('id') and r.get('name_item')}
    return {
        'orderDetail':         parse_order_detail('Core/Order/OrderDetail.csv', item_names),
        'orderSystem':         parse_order_system('Core/Order/OrderSystem.csv'),
        'orderGold':           load_csv('Core/Order/OrderGold.csv'),
        'orderSystemReward':   load_csv('Core/Order/OrderSystemReward.csv',  ['theme_type']),
        'rewardMinDistribute': load_csv('Core/Order/RewardMinDistributeOrderDetail.csv'),
    }


def load_buildup():
    return {
        'buildUpGoalData':        load_csv('Core/BuildUpGoal/BuildUpGoalData.csv',        ['theme']),
        'buildUpGoalReward':      load_csv('Core/BuildUpGoal/BuildUpGoalReward.csv',       ['theme_type']),
        'buildUpGoalRewardBonus': load_csv('Core/BuildUpGoal/BuildUpGoalRewardBonus.csv',  ['type', 'index']),
        'buyCurrency':            load_csv('Features/BuyCurrency/BuyCurrency.csv'),
        'chefsBookData':          load_csv('Features/ChefsBook/ChefsBookData.csv',         ['chefs_type']),
        'convertTime':            load_csv('Extends/ConvertTime/ConvertTimeTool.csv'),
        'generalConfig':          load_csv('General/GeneralConfig.csv'),
    }


def load_boxes():
    fill_keys = ['item_save_type', 'id_item', 'many_generator', 'time_unlock']
    return {
        'boxes': {
            'itemBoxGenerator':    load_csv('Core/Box&Gift/ItemBoxGenerator.csv',    fill_keys),
            'itemAssistantsChest': load_csv('Core/Box&Gift/ItemAssistantsChest.csv', fill_keys),
            'itemChefsChest':      load_csv('Core/Box&Gift/ItemChefsChest.csv',      fill_keys),
            'itemCoinBox':         load_csv('Core/Box&Gift/ItemCoinBox.csv',          fill_keys),
            'itemDailyGift':       load_csv('Core/Box&Gift/ItemDailyGift.csv',        fill_keys),
            'itemEquipmentBox':    load_csv('Core/Box&Gift/ItemEquipmentBox.csv',     fill_keys),
            'itemFlushGift':       load_csv('Core/Box&Gift/ItemFlushGift.csv',        fill_keys),
            'itemGift':            load_csv('Core/Box&Gift/ItemGift.csv',             fill_keys),
            'itemLuckyBox':        load_csv('Core/Box&Gift/ItemLuckyBox.csv',         fill_keys),
            'itemLuckyHandbag':    load_csv('Core/Box&Gift/ItemLuckyHandbag.csv',     fill_keys),
            'itemTraineeBox':      load_csv('Core/Box&Gift/ItemTraineeBox.csv',       fill_keys),
        }
    }


def load_iap():
    # Chỉ load các gói bán CÓ THẬT trong game — theo docs/BusinessModel_en.pdf (Section C.1).
    # Các gói KHÔNG có trong PDF là rác còn sót từ CSV project khác và bị loại khỏi số liệu:
    #   CoinPack        — không có trong PDF (product id namespace "coffeepack" — game khác); là gói bơm 334k gold ảo
    #   BattlePassPack  — không có trong danh sách gói của PDF
    #   LuckySpinPack   — không có trong PDF
    #   RemoveAdsPack   — PDF ghi rõ "No remove-ads placements"
    #   BundlePack      — user yêu cầu loại (dù có trong PDF): namespace "coffeepack", bơm gold combo ảo
    #   ChainPack       — product id namespace "coffeepack" (không phải com.deviloper.m1.food.merge.cooking.puzzle)
    # TIÊU CHÍ CHUẨN: chỉ giữ gói có product id thuộc package name com.deviloper.m1.food.merge.cooking.puzzle
    # (hoặc gói không có product id nào — config/free). Gói mang product id của game khác → loại.
    # Nếu ai copy các CSV này vào Csv/Features/IAP/ thì vẫn bị bỏ qua vì key không được khai báo ở đây.
    # (economyModel.js còn 1 lớp chặn nữa qua IAP_IGNORE cho data-iap.js chưa regenerate.)
    pk = ['id', 'pack_name']
    return {
        'iapGemPack':           load_csv('Features/IAP/GemPack.csv',            pk),
        'iapEnergyPack':        load_csv('Features/IAP/EnergyPack.csv',          pk),
        'iapEnergyTrilogyPack': load_csv('Features/IAP/EnergyTrilogyPack.csv',   pk),
        'iapStarterPack':       load_csv('Features/IAP/StarterPack.csv',         pk),
        'iapOpenningPack':      load_csv('Features/IAP/OpenningPack.csv',        pk),
        'iapDailyDealsPack':    load_csv('Features/IAP/DailyDealsPack.csv',      pk),
        'iapDailyDealsPack2':   load_csv('Features/IAP/DailyDealsPack2.csv',     pk),
        'iapStandardDiamond':   load_csv('Features/IAP/StandardDiamond.csv',     pk),
        'iapGoldWeeklyPass':    load_csv('Features/IAP/GoldWeeklyPass.csv',      pk),
        'iapSilverWeeklyPass':  load_csv('Features/IAP/SilverWeeklyPass.csv',    pk),
        'iapSupplyChestPack':   load_csv('Features/IAP/SupplyChestPack.csv',     pk),
        'iapNiceBoostPack':     load_csv('Features/IAP/NiceBoostPack.csv',       pk),
        'iapStepPricePack':     load_csv('Features/IAP/StepPricePack.csv',       pk),
        'iapHappinessExpress':  load_csv('Features/IAP/HappinessExpress.csv',    pk),
        'iapLuxuriousOffer':    load_csv('Features/IAP/LuxuriousOffer.csv',      pk),
        'iapFirstPurchase':     load_csv('Features/IAP/FirstPurchase.csv',       pk),
        'iapPiggyBank':         load_csv('Features/IAP/PiggyBank.csv',           pk),
        'iapVideoBonuses':      load_csv('Features/IAP/VideoBonuses.csv',        pk),
        'iapPackDuration':      load_csv('Features/IAP/PackDuration.csv',        pk),
    }


def load_progression():
    """Lộ trình unlock feature + onboarding sequence + mốc mở kho."""
    return {
        'unlockFeature':        load_csv('Features/Unlock/UnlockFeature.csv'),
        'featureSequence':      load_csv('Features/Unlock/FeatureSequence.csv'),
        'levelUnlockInventory': load_csv('Features/Unlock/LevelUnlockInventory.csv'),
        'dailyReward':          load_csv('Features/DailyReward/DailyReward.csv'),
    }


# ── Main ──────────────────────────────────────────────────────────────────────

DOMAINS = [
    ('data-items.js',      load_items,      'Items — ItemMerge (as itemData+itemMerge), ItemCurrency, ItemExpand, CookingRecipes'),
    ('data-generators.js', load_generators, 'Generators — ItemGenerator, DynamicGeneratorSpawning'),
    ('data-orders.js',     load_orders,     'Orders — OrderDetail, OrderSystem, OrderGold, Rewards'),
    ('data-buildup.js',    load_buildup,    'BuildUp — BuildUpGoal, BuyCurrency, ChefsBook, ConvertTime'),
    ('data-boxes.js',      load_boxes,      'Boxes — All Box & Gift types'),
    ('data-iap.js',        load_iap,        'IAP — All in-app purchase packages'),
    ('data-progression.js', load_progression, 'Progression — UnlockFeature, FeatureSequence, LevelUnlockInventory'),
]


def main():
    os.makedirs(OUT_DIR, exist_ok=True)

    # Init file: declare window.GameData = {}
    init_path = os.path.join(OUT_DIR, 'data-init.js')
    with open(init_path, 'w', encoding='utf-8') as f:
        f.write('// Auto-generated by generate_data.py. DO NOT EDIT manually.\n')
        f.write('window.GameData = {};\n')
    print('Generated js/data/:\n  → data-init.js')

    total_kb = 0
    for filename, loader, label in DOMAINS:
        print(f'\nLoading {label}...')
        data = loader()
        write_data_file(filename, data, label)
        total_kb += os.path.getsize(os.path.join(OUT_DIR, filename)) / 1024

    print(f'\nDone! js/data/ total — {total_kb:.0f} KB across {len(DOMAINS) + 1} files.')
    print('index.html phai load js/data/data-init.js truoc, roi den cac data-*.js.')


if __name__ == '__main__':
    main()
