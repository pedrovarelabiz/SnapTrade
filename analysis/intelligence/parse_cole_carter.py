#!/usr/bin/env python3
"""Parse Cole Carter raw messages into structured signals"""
import json, re, os
from datetime import datetime

INPUT = "/Users/pedrovarela/Documents/snaptrade-analysis/raw_messages_cole_carter.json"
OUTPUT_DIR = "/Users/pedrovarela/Documents/snaptrade-analysis/intelligence"

msgs = json.load(open(INPUT))
signals = []
results = []
session_results = []

# Pattern 1: "Getting: PAIR OTC ready ... Analysis: DIRECTION"
sig_pattern = re.compile(r'Getting[:\s]+([A-Z]{3}/[A-Z]{3,4})\s+(?:OTC\s+)?(?:ready|READY).*?Analysis[:\s]+(SELL|BUY|CALL|PUT)', re.IGNORECASE | re.DOTALL)

# Pattern 2: "PAIR OTC +X,XXX USD PROFIT" (session result lines)
result_pattern = re.compile(r'([A-Z]{3}/[A-Z]{3,4})\s+(?:OTC\s+)?\+?([\d,]+)\s*USD\s*(PROFIT|LOSS)', re.IGNORECASE)

# Pattern 3: standalone star results
star_result = re.compile(r'⭐️?\s*\*?\*?(PROFIT|LOSS)\*?\*?\s*⭐️?', re.IGNORECASE)

# Pattern 4: martingale signals "x2.5 Amount SELL/BUY"
gale_pattern = re.compile(r'x([\d.]+)\s+Amount\s+(SELL|BUY|CALL|PUT)', re.IGNORECASE)

for m in msgs:
    text = m.get('text', '')
    if isinstance(text, list):
        text = ' '.join(str(x) for x in text)
    text = str(text)
    msg_id = m.get('id')
    date = m.get('date', '')
    reply_to = m.get('reply_to_msg_id')

    # Check for signals
    sig_match = sig_pattern.search(text)
    if sig_match:
        asset = sig_match.group(1).replace('/', '')
        direction = sig_match.group(2).upper()
        if direction == 'SELL': direction = 'PUT'
        if direction == 'BUY': direction = 'CALL'

        # Check for gale
        gale_match = gale_pattern.search(text)
        is_gale = bool(gale_match)
        gale_mult = float(gale_match.group(1)) if gale_match else 1.0

        signals.append({
            'msg_id': msg_id,
            'date': date,
            'asset': asset + '_otc',
            'direction': direction,
            'expiration_minutes': 5,
            'is_martingale': is_gale,
            'gale_multiplier': gale_mult,
            'channel': 'cole_carter',
            'raw_text': text[:200]
        })

    # Check for session results (multiple pairs in one message)
    res_matches = result_pattern.findall(text)
    for rm in res_matches:
        session_results.append({
            'msg_id': msg_id,
            'date': date,
            'asset': rm[0].replace('/', '') + '_otc',
            'amount_usd': int(rm[1].replace(',', '')),
            'outcome': rm[2].upper(),
            'channel': 'cole_carter'
        })

    # Check for standalone PROFIT/LOSS
    if star_result.search(text) and not res_matches and not sig_match:
        outcome = 'WIN' if 'PROFIT' in text.upper() else 'LOSS'
        results.append({
            'msg_id': msg_id,
            'date': date,
            'outcome': outcome,
            'reply_to': reply_to,
            'channel': 'cole_carter'
        })

# Correlate: match signals with their closest result
matched_signals = []
for sig in signals:
    sig_time = sig['date']
    # Find result within 10 min after signal
    best_result = None
    for r in results + session_results:
        if r['date'] >= sig_time and r['date'] <= sig_time[:11] + '23:59:59':
            if r.get('asset') == sig['asset'] or not r.get('asset'):
                best_result = r
                break
    sig['result'] = best_result.get('outcome', 'WIN') if best_result else None
    matched_signals.append(sig)

# Stats
total = len(matched_signals)
with_result = sum(1 for s in matched_signals if s['result'])
wins = sum(1 for s in matched_signals if s['result'] == 'WIN')
losses = sum(1 for s in matched_signals if s['result'] == 'LOSS')

summary = {
    'channel': 'cole_carter',
    'total_signals': total,
    'with_result': with_result,
    'wins': wins,
    'losses': losses,
    'win_rate': round(wins/(wins+losses)*100, 1) if (wins+losses) > 0 else 0,
    'session_results_found': len(session_results),
    'standalone_results_found': len(results),
    'unique_assets': len(set(s['asset'] for s in matched_signals)),
    'date_range': [matched_signals[0]['date'][:10] if matched_signals else '', matched_signals[-1]['date'][:10] if matched_signals else '']
}

with open(f"{OUTPUT_DIR}/parsed_cole_carter.json", "w") as f:
    json.dump(matched_signals, f, indent=2)
with open(f"{OUTPUT_DIR}/cole_carter_session_results.json", "w") as f:
    json.dump(session_results, f, indent=2)

print(json.dumps(summary, indent=2))
