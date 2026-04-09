import json,re,os
from collections import defaultdict,Counter

OUT="intelligence"
os.makedirs(OUT,exist_ok=True)

# Patterns for PT-format channels (blacklist, sinais_mil)
sig_pt=re.compile(r'SINAL\s+(?:BLACKLIST|VIP|MIL).*?([A-Z]{3,4}/[A-Z]{3,4})\s+(?:OTC\s+)?.*?(CALL|PUT)',re.I|re.DOTALL)
sig_pt2=re.compile(r'([A-Z]{3}/[A-Z]{3,4})\s+OTC.*?(CALL|PUT|⬆️|⬇️)',re.I|re.DOTALL)
win_primeira=re.compile(r'win\s+de\s+primeira|win\s+primeira|winzao',re.I)
win_gale=re.compile(r'win\s+no\s+(?:gale|martingale)',re.I)
loss_pt=re.compile(r'loss[\s.]|💢|não pagou|nao pagou',re.I)

# Patterns for EN-format channels (cole_carter, private_team)
sig_en=re.compile(r'Getting[:\s]+([A-Z]{3}/[A-Z]{3,4})\s+(?:OTC\s+)?(?:ready|READY).*?Analysis[:\s]+(SELL|BUY|CALL|PUT)',re.I|re.DOTALL)
profit_star=re.compile(r'⭐️?\s*\*?\*?PROFIT\*?\*?\s*⭐️?',re.I)
loss_star=re.compile(r'⭐️?\s*\*?\*?LOSS\*?\*?\s*⭐️?',re.I)

def parse_pt_channel(fname, channel_name):
    d=json.load(open(fname))
    d.sort(key=lambda x:x.get('date',''))
    signals=[];last_sig=None
    for m in d:
        t=str(m.get('text',''))
        date=m.get('date','')[:19]
        # Check for signal
        sm=sig_pt.search(t) or sig_pt2.search(t)
        if sm:
            asset=sm.group(1).replace('/','')+'_otc'
            direction=sm.group(2).upper()
            if '⬆' in direction or direction=='CALL':direction='CALL'
            elif '⬇' in direction or direction=='PUT':direction='PUT'
            last_sig={'date':date,'asset':asset,'direction':direction,'channel':channel_name,'result':None,'gale_level':None}
            signals.append(last_sig)
            continue
        # Check for result
        if last_sig and not last_sig['result']:
            if win_primeira.search(t):
                last_sig['result']='WIN';last_sig['gale_level']=0
            elif win_gale.search(t):
                last_sig['result']='WIN';last_sig['gale_level']=1
            elif loss_pt.search(t):
                last_sig['result']='LOSS';last_sig['gale_level']=1
    return signals

def parse_en_channel(fname, channel_name):
    d=json.load(open(fname))
    d.sort(key=lambda x:x.get('date',''))
    signals=[];last_sig=None
    for m in d:
        t=str(m.get('text',''))
        date=m.get('date','')[:19]
        sm=sig_en.search(t)
        if sm:
            asset=sm.group(1).replace('/','')+'_otc'
            direction=sm.group(2).upper()
            if direction=='SELL':direction='PUT'
            if direction=='BUY':direction='CALL'
            last_sig={'date':date,'asset':asset,'direction':direction,'channel':channel_name,'result':None,'gale_level':None}
            signals.append(last_sig)
            continue
        if last_sig and not last_sig['result']:
            if profit_star.search(t):
                last_sig['result']='WIN';last_sig['gale_level']=0
            elif loss_star.search(t):
                last_sig['result']='LOSS';last_sig['gale_level']=0
    return signals

# Parse all 4 channels
for ch,fname,parser in [
    ('blacklist','blacklist.json','pt'),
    ('sinais_mil','sinais_mil.json','pt'),
    ('private_team','private_team.json','en'),
    ('cole_carter','cole_carter.json','en'),
]:
    if parser=='pt':
        sigs=parse_pt_channel(fname,ch)
    else:
        sigs=parse_en_channel(fname,ch)
    with_res=[s for s in sigs if s['result']]
    w=sum(1 for s in with_res if s['result']=='WIN')
    l=sum(1 for s in with_res if s['result']=='LOSS')
    gl=Counter(s.get('gale_level') for s in with_res)
    dates=[s['date'][:10] for s in sigs if s['date']]
    assets=len(set(s['asset'] for s in sigs))
    json.dump(sigs,open(f'{OUT}/parsed_v2_{ch}.json','w'),indent=2)
    print(f"{ch:15s}: {len(sigs):5d} sigs, {len(with_res):5d} w/result, {w}W/{l}L={round(w/(w+l)*100,1) if w+l else 0}% GL:{dict(gl)} assets={assets} {min(dates)[:10] if dates else '?'}->{max(dates)[:10] if dates else '?'}")
