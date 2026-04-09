import json,re,os
from collections import Counter
OUT="intelligence"
os.makedirs(OUT,exist_ok=True)

def parse_pt(fname,ch):
    d=json.load(open(fname))
    d.sort(key=lambda x:x.get('date',''))
    sig_re=re.compile(r'([A-Z]{3,6}(?:/[A-Z]{3,4})?\s+OTC)\s*-\s*(PUT|CALL)\s*-?\s*(\d{2}:\d{2})?',re.I)
    sigs=[];last_sig=None
    for m in d:
        t=str(m.get('text','') or '')
        date=m.get('date','')[:19]
        if 'SINAL' in t and 'OTC' in t:
            sm=sig_re.search(t)
            if sm:
                raw=sm.group(1).replace(' ','').replace('OTC','').replace('/','')
                last_sig={'date':date,'asset':raw+'_otc','direction':sm.group(2).upper(),'time':sm.group(3) or '','channel':ch,'result':None,'gale_level':None}
                sigs.append(last_sig)
                continue
        if last_sig and last_sig['result'] is None:
            tl=t.lower()
            if 'win de primeira' in tl or 'win primeira' in tl or 'winzao' in tl:
                last_sig['result']='WIN';last_sig['gale_level']=0
            elif 'win no gale' in tl or 'win gale' in tl or 'win no martingale' in tl:
                last_sig['result']='WIN';last_sig['gale_level']=1
            elif ('loss' in tl and len(t)<100) or 'não pagou' in tl or 'nao pagou' in tl or '💢' in t:
                last_sig['result']='LOSS';last_sig['gale_level']=1
    wr=[s for s in sigs if s['result']]
    w=sum(1 for s in wr if s['result']=='WIN')
    l=sum(1 for s in wr if s['result']=='LOSS')
    gl=Counter(s['gale_level'] for s in wr)
    dates=[s['date'][:10] for s in sigs if s['date']]
    json.dump(sigs,open(f'{OUT}/full_{ch}.json','w'),indent=2)
    print(f"{ch:15s} sigs={len(sigs):6d} w/res={len(wr):5d} {w}W/{l}L={round(w/(w+l)*100,1) if w+l else 0}% GL:{dict(sorted(gl.items()))} {min(dates) if dates else '?'}->{max(dates) if dates else '?'}")

def parse_en(fname,ch):
    d=json.load(open(fname))
    d.sort(key=lambda x:x.get('date',''))
    sig_re=re.compile(r'Getting[:\s]+([A-Z]{3}/[A-Z]{3,4})\s+(?:OTC\s+)?(?:ready|READY).*?Analysis[:\s]+(SELL|BUY|CALL|PUT)',re.I|re.DOTALL)
    star_profit=re.compile(r'⭐️?\s*\*?\*?PROFIT\*?\*?\s*⭐️?',re.I)
    star_loss=re.compile(r'⭐️?\s*\*?\*?LOSS\*?\*?\s*⭐️?',re.I)
    sigs=[];last_sig=None
    for m in d:
        t=str(m.get('text','') or '')
        date=m.get('date','')[:19]
        sm=sig_re.search(t)
        if sm:
            direction=sm.group(2).upper()
            if direction=='SELL':direction='PUT'
            if direction=='BUY':direction='CALL'
            last_sig={'date':date,'asset':sm.group(1).replace('/','')+'_otc','direction':direction,'channel':ch,'result':None,'gale_level':None}
            sigs.append(last_sig)
            continue
        if last_sig and last_sig['result'] is None:
            if star_profit.search(t) and not star_loss.search(t):
                last_sig['result']='WIN';last_sig['gale_level']=0
            elif star_loss.search(t):
                last_sig['result']='LOSS';last_sig['gale_level']=0
    wr=[s for s in sigs if s['result']]
    w=sum(1 for s in wr if s['result']=='WIN')
    l=sum(1 for s in wr if s['result']=='LOSS')
    gl=Counter(s['gale_level'] for s in wr)
    dates=[s['date'][:10] for s in sigs if s['date']]
    json.dump(sigs,open(f'{OUT}/full_{ch}.json','w'),indent=2)
    print(f"{ch:15s} sigs={len(sigs):6d} w/res={len(wr):5d} {w}W/{l}L={round(w/(w+l)*100,1) if w+l else 0}% GL:{dict(sorted(gl.items()))} {min(dates) if dates else '?'}->{max(dates) if dates else '?'}")

import sys
ch=sys.argv[1] if len(sys.argv)>1 else 'all'
if ch in ('blacklist','all'):parse_pt('blacklist.json','blacklist')
if ch in ('sinais_mil','all'):parse_pt('sinais_mil.json','sinais_mil')
if ch in ('private_team','all'):parse_en('private_team.json','private_team')
if ch in ('cole_carter','all'):parse_en('cole_carter.json','cole_carter')
