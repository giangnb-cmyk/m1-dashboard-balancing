"""
fetch_localize.py
Download localization sheet từ Google Sheets, lấy cột English-en,
update name_item trong ItemMerge.csv và ItemData.csv, rồi regenerate js/data/.

Cách dùng:
  python fetch_localize.py
"""

import csv, io, os, sys, urllib.request

sys.stdout.reconfigure(encoding='utf-8')

BASE_DIR   = os.path.dirname(os.path.abspath(__file__))
SHEET_URL  = (
    'https://docs.google.com/spreadsheets/d/'
    '1JDChbnV93bYxYP7ulX4X6KYZk9XAS4kHQDihaEnD-3c'
    '/export?format=csv&gid=448968395'
)
ITEM_MERGE = os.path.join(BASE_DIR, 'Csv', 'Core', 'ItemIdentify', 'ItemMerge.csv')
ITEM_DATA  = os.path.join(BASE_DIR, 'Csv', 'Core', 'ItemIdentify', 'ItemData.csv')


# ── Step 1: Download sheet ────────────────────────────────────────────────────

def download_localize(url):
    print('Downloading localization sheet...')
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req, timeout=30) as resp:
        raw = resp.read().decode('utf-8')
    reader = csv.DictReader(io.StringIO(raw))
    name_map = {}
    for row in reader:
        key = row.get('key', '').strip()
        en  = (row.get('English-en') or row.get('English(Origin)') or '').strip()
        if not key or not en:
            continue
        # key format: "{itemID}_name"
        if key.endswith('_name'):
            item_id = key[:-5]
            name_map[item_id] = en
    print(f'  → {len(name_map)} item names loaded')
    return name_map


# ── Step 2: Update CSV ────────────────────────────────────────────────────────

def update_csv(path, id_field, name_field, name_map):
    if not os.path.exists(path):
        print(f'  [SKIP] {path} not found')
        return 0

    for enc in ('utf-8-sig', 'utf-8', 'utf-16', 'cp1252'):
        try:
            with open(path, encoding=enc, newline='') as f:
                rows = list(csv.DictReader(f))
                fieldnames = rows[0].keys() if rows else []
            break
        except (UnicodeDecodeError, UnicodeError):
            continue
    else:
        print(f'  [ERROR] Cannot decode {path}')
        return 0

    updated = 0
    for row in rows:
        item_id = row.get(id_field, '').strip()
        new_name = name_map.get(item_id)
        if new_name and row.get(name_field, '').strip() != new_name:
            row[name_field] = new_name
            updated += 1

    with open(path, 'w', encoding='utf-8-sig', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)

    rel = os.path.relpath(path, BASE_DIR)
    print(f'  → {rel}: {updated} names updated')
    return updated


# ── Step 3: Regenerate js/data/ ──────────────────────────────────────────────

def regenerate():
    script = os.path.join(BASE_DIR, 'generate_data.py')
    if not os.path.exists(script):
        print('  [SKIP] generate_data.py not found')
        return
    print('\nRegenerating js/data/...')
    os.system(f'"{sys.executable}" "{script}"')


# ── Main ─────────────────────────────────────────────────────────────────────

def main():
    name_map = download_localize(SHEET_URL)
    if not name_map:
        print('No names downloaded, aborting.')
        return

    print('\nUpdating CSVs...')
    total = 0
    total += update_csv(ITEM_MERGE, 'id',     'name_item', name_map)
    total += update_csv(ITEM_DATA,  'itemID',  'name_item', name_map)
    print(f'\nTotal: {total} names updated across CSVs')

    if total > 0:
        regenerate()
    else:
        print('No changes — js/data/ not regenerated.')

    print('\nDone!')


if __name__ == '__main__':
    main()
