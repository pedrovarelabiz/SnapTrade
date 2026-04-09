#!/usr/bin/env python3
import json, os
OUT="intelligence"

def norm(s, ch):
    return {
        'asset': s.get('asset',''),
        'direction': s.get('direction',''),
        'result': s.get('result',''),
        'date': s.get('date','') or s.get('entry_time_utc','') or s.get('entryTimeUtc','') or s.get('created_at',''),
        'expiration': s.get('expiration_minutes',0) or s.get('expirationMinutes',0) or s.get('exp',5),
        'gale_level': s.get('gale_level',0) or s.get('galeLevel',0),
        'is_martingale': s.get('is_martingale', False) or (s.get('gale_level',0) or s.get('galeLevel',0) or 0) > 0,
        'channel': ch,
        'msg_id': s.get('telegram_msg_id','') or s.get('telegramMsgId','') or s.get('msg_id','')
    }

all_signals=[]
# 1. seed_signals (TYL VIP)
for s in json.load(open('seed_signals.json')):
    all_signals.append(norm(s,'tyl_vip'))
# 2. TYL Trading
for s in json.load(open('db_import_tyl_trading.json')):
    all_signals.append(norm(s,'tyl_trading'))
# 3. Sinais Mil
for s in json.load(open('db_import_sinais_mil.json')):
    all_signals.append(norm(s,'sinais_mil'))
# 4. Blacklist
for s in json.load(open('db_import_blacklist.json')):
    all_signals.append(norm(s,'blacklist'))
# 5. Cole Carter (parsed)
for s in json.load(open(f'{OUT}/parsed_cole_carter.json')):
    all_signals.append(norm(s,'cole_carter'))
# 6. Private Team (parsed)
for s in json.load(open(f'{OUT}/parsed_private_team.json')):
    all_signals.append(norm(s,'private_team'))
# 7. VIP OTC (parsed)
for s in json.load(open(f'{OUT}/parsed_vip_otc.json')):
    all_signals.append(norm(s,'vip_otc_market'))

json.dump(all_signals,open(f'{OUT}/all_signals_unified.json','w'),indent=2)
from collections import Counter
ch_counts=Counter(s['channel'] for s in all_signals)
with_res=Counter(s['channel'] for s in all_signals if s['result'] in ('win','loss','WIN','LOSS'))
for ch in sorted(ch_counts.keys()):
    print(f"{ch}: {ch_counts[ch]} total, {with_res.get(ch,0)} with result")
print(f"TOTAL: {len(all_signals)}")
