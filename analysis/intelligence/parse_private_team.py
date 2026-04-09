#!/usr/bin/env python3
"""Parse Private Team raw messages into structured signals"""
import json, re, os

INPUT = "/Users/pedrovarela/Documents/snaptrade-analysis/raw_messages_private_team.json"
OUTPUT_DIR = "/Users/pedrovarela/Documents/snaptrade-analysis/intelligence"

msgs = json.load(open(INPUT))

# First pass: classify all messages
classified = []
sig_pattern = re.compile(r'Getting[:\s]+([A-Z]{3}/[A-Z]{3,4})\s+(?:OTC\s+)?(?:ready|READY).*?Analysis[:\s]+(SELL|BUY|CALL|PUT)', re.IGNORECASE | re.DOTALL)
gale_pattern = re.compile(r'x([\d.]+)\s+Amount\s+(SELL|BUY|CALL|PUT)', re.IGNORECASE)
result_line = re.compile(r'([A-Z]{3}/[A-Z]{3,4})\s+(?:OTC\s+)?\+?([\d,]+)\s*USD\s*(PROFIT|LOSS)', re.IGNORECASE)
star_result = re.compile(r'⭐️\s*\*?\*?(PROFIT|LOSS)\*?\*?\s*⭐️', re.IGNORECASE)
loss_marker = re.compile(r'⭐️\s*\*?\*?LOSS\*?\*?\s*⭐️', re.IGNORECASE)

signals = []
standalone_results = []
session_results = []

for m in msgs:
    text = m.get('text', '')
    if isinstance(text, list):
        text = ' '.join(str(x) for x in text)
    text = str(text)
    msg_id = m.get('id')
    date = m.get('date', '')
    reply_to = m.get('reply_to_msg_id')

    sig_match = sig_pattern.search(text)
    if sig_match:
        asset = sig_match.group(1).replace('/', '') + '_otc'
        direction = sig_match.group(2).upper()
        if direction == 'SELL': direction = 'PUT'
        if direction == 'BUY': direction = 'CALL'
        gale_match = gale_pattern.search(text)
        signals.append({
            'msg_id': msg_id, 'date': date, 'asset': asset,
            'direction': direction, 'expiration_minutes': 5,
            'is_martingale': bool(gale_match),
            'gale_multiplier': float(gale_match.group(1)) if gale_match else 1.0,
            'channel': 'private_team'
        })

    # Session result lines
    res_matches = result_line.findall(text)
    for rm in res_matches:
        session_results.append({
            'msg_id': msg_id, 'date': date,
            'asset': rm[0].replace('/','') + '_otc',
            'amount_usd': int(rm[1].replace(',','')),
            'outcome': rm[2].upper(),
            'channel': 'private_team'
        })

    # Standalone PROFIT/LOSS markers
    if star_result.search(text) and not res_matches and not sig_match:
        is_loss = bool(loss_marker.search(text))
        standalone_results.append({
            'msg_id': msg_id, 'date': date,
            'outcome': 'LOSS' if is_loss else 'WIN',
            'reply_to': reply_to, 'channel': 'private_team'
        })

# Match signals with results chronologically
# For each signal, find the next standalone result or session result
all_results_chrono = sorted(standalone_results + [{'msg_id': r['msg_id'], 'date': r['date'], 'outcome': r['outcome'], 'asset': r.get('asset')} for r in session_results], key=lambda x: (x['date'], x['msg_id']))

result_idx = 0
matched = []
for sig in signals:
    # Find next result after this signal
    while result_idx < len(all_results_chrono) and all_results_chrono[result_idx]['date'] < sig['date']:
        result_idx += 1

    # Look for matching result (same date, close in time)
    found = None
    for j in range(result_idx, min(result_idx + 5, len(all_results_chrono))):
        r = all_results_chrono[j]
        # Same asset match or standalone
        if r.get('asset') == sig['asset'] or not r.get('asset'):
            found = r['outcome']
            break
    sig['result'] = found
    matched.append(sig)

# Filter out martingale (gale) signals for clean stats
non_gale = [s for s in matched if not s['is_martingale']]
gale_only = [s for s in matched if s['is_martingale']]

total = len(non_gale)
with_res = sum(1 for s in non_gale if s['result'])
wins = sum(1 for s in non_gale if s['result'] == 'WIN')
losses = sum(1 for s in non_gale if s['result'] == 'LOSS')

summary = {
    'channel': 'private_team',
    'total_signals': len(matched),
    'non_gale_signals': total,
    'gale_signals': len(gale_only),
    'with_result': with_res,
    'wins': wins, 'losses': losses,
    'win_rate': round(wins/(wins+losses)*100,1) if (wins+losses) > 0 else 0,
    'session_results': len(session_results),
    'standalone_results': len(standalone_results),
    'standalone_losses': sum(1 for r in standalone_results if r['outcome'] == 'LOSS'),
    'date_range': [matched[0]['date'][:10] if matched else '', matched[-1]['date'][:10] if matched else '']
}

with open(f"{OUTPUT_DIR}/parsed_private_team.json", "w") as f:
    json.dump(matched, f, indent=2)

print(json.dumps(summary, indent=2))
