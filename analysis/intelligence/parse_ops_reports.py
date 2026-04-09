#!/usr/bin/env python3
"""Parse ALL OPERATIONS REPORT messages from TYL VIP"""
import json, re, os
from collections import defaultdict, Counter
from datetime import datetime

INPUT = "raw_messages_tyl_vip.json"
OUT = "intelligence"
os.makedirs(OUT, exist_ok=True)

d = json.load(open(INPUT))
ops = [m for m in d if 'OPERATIONS REPORT' in str(m.get('text',''))]
ops.sort(key=lambda x: x['date'])

# Parse patterns
# Format 1 (early): "SIGNAL 1 -> PROFIT ✅" or "SIGNAL 1 -> LOSS ❌"
pat1 = re.compile(r'SIGNAL\s+\d+\s*->\s*(PROFIT|LOSS|WIN)', re.I)
# Format 2 (later): "EUR/USD OTC - 07:05 -> WIN ✅" or "AUD/USD OTC - 07:05 -> LOSS ❌"
pat2 = re.compile(r'([A-Z]{3}/[A-Z]{3,4})\s+OTC\s*-\s*(\d{2}:\d{2})\s*->\s*(WIN|LOSS|PROFIT)', re.I)
# Date from header: "OPERATIONS REPORT (DD/MM)" or "(DD/MM/YY)"
date_pat = re.compile(r'OPERATIONS REPORT\s*\(?(\d{2}/\d{2}(?:/\d{2,4})?)\)?')
# Summary line: "NN WINS" and "NN LOSS"
wins_pat = re.compile(r'(\d+)\s*WIN', re.I)
loss_pat = re.compile(r'(\d+)\s*LOSS', re.I)

all_trades = []
daily_reports = []

for m in ops:
    text = str(m.get('text',''))
    msg_date = m['date'][:10]

    # Try to extract report date from header
    dm = date_pat.search(text)
    report_date = msg_date  # fallback
    if dm:
        parts = dm.group(1).split('/')
        if len(parts) == 2:
            report_date = f"{msg_date[:4]}-{parts[1]}-{parts[0]}"
        elif len(parts) == 3:
            y = parts[2] if len(parts[2]) == 4 else f"20{parts[2]}"
            report_date = f"{y}-{parts[1]}-{parts[0]}"

    # Parse individual trades
    trades_f2 = pat2.findall(text)
    trades_f1 = pat1.findall(text)

    day_trades = []
    if trades_f2:
        for asset, time_str, result in trades_f2:
            r = 'WIN' if result.upper() in ('WIN','PROFIT') else 'LOSS'
            day_trades.append({
                'date': report_date,
                'msg_date': msg_date,
                'asset': asset.replace('/','') + '_otc',
                'time': time_str,
                'result': r,
                'format': 'detailed'
            })
    elif trades_f1:
        for result in trades_f1:
            r = 'WIN' if result.upper() in ('WIN','PROFIT') else 'LOSS'
            day_trades.append({
                'date': report_date,
                'msg_date': msg_date,
                'asset': 'UNKNOWN',
                'time': 'UNKNOWN',
                'result': r,
                'format': 'simple'
            })

    all_trades.extend(day_trades)

    # Summary
    w_match = wins_pat.findall(text)
    l_match = loss_pat.findall(text)
    total_w = sum(int(x) for x in w_match) if w_match else 0
    total_l = sum(int(x) for x in l_match) if l_match else 0

    daily_reports.append({
        'report_date': report_date,
        'msg_date': msg_date,
        'parsed_wins': sum(1 for t in day_trades if t['result']=='WIN'),
        'parsed_losses': sum(1 for t in day_trades if t['result']=='LOSS'),
        'summary_wins': total_w,
        'summary_losses': total_l,
        'trades_count': len(day_trades),
        'format': 'detailed' if trades_f2 else 'simple'
    })

# Save
json.dump(all_trades, open(f'{OUT}/ops_report_trades.json','w'), indent=2)
json.dump(daily_reports, open(f'{OUT}/ops_report_daily.json','w'), indent=2)

# Stats
wins = sum(1 for t in all_trades if t['result']=='WIN')
losses = sum(1 for t in all_trades if t['result']=='LOSS')
total = wins + losses
detailed = [t for t in all_trades if t['format']=='detailed']
simple = [t for t in all_trades if t['format']=='simple']

print(f"Reports parsed: {len(daily_reports)}")
print(f"Total trades: {total} ({len(detailed)} detailed, {len(simple)} simple)")
print(f"Global: {wins}W / {losses}L = {round(wins/total*100,1) if total else 0}% WR")
print(f"Date range: {all_trades[0]['date'] if all_trades else '?'} -> {all_trades[-1]['date'] if all_trades else '?'}")
