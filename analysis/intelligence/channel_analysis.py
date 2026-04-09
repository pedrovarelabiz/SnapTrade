#!/usr/bin/env python3
import json,os
from collections import Counter, defaultdict
from datetime import datetime

data=json.load(open('intelligence/all_signals_unified.json'))
# Filter to signals with results
has_res=[s for s in data if s['result'] and s['result'].lower() in ('win','loss')]

channels=sorted(set(s['channel'] for s in has_res))
report={}
for ch in channels:
    sigs=[s for s in has_res if s['channel']==ch]
    wins=sum(1 for s in sigs if s['result'].lower()=='win')
    losses=sum(1 for s in sigs if s['result'].lower()=='loss')
    total=wins+losses
    wr=round(wins/total*100,2) if total else 0
    # Non-gale only
    ng=[s for s in sigs if not s['is_martingale'] and s.get('gale_level',0)==0]
    ng_w=sum(1 for s in ng if s['result'].lower()=='win')
    ng_l=sum(1 for s in ng if s['result'].lower()=='loss')
    ng_t=ng_w+ng_l
    ng_wr=round(ng_w/ng_t*100,2) if ng_t else 0
    # Assets
    assets=Counter(s['asset'] for s in sigs)
    # Direction
    dirs=Counter(s['direction'] for s in sigs)
    # Date range
    dates=[s['date'] for s in sigs if s['date']]
    dates.sort()
    # Top/bottom assets by WR (min 10 signals)
    asset_wr={}
    for a in assets:
        a_sigs=[s for s in sigs if s['asset']==a]
        aw=sum(1 for s in a_sigs if s['result'].lower()=='win')
        at=len(a_sigs)
        if at>=10:asset_wr[a]={'wr':round(aw/at*100,1),'n':at}
    top5=sorted(asset_wr.items(),key=lambda x:-x[1]['wr'])[:5]
    bot5=sorted(asset_wr.items(),key=lambda x:x[1]['wr'])[:5]
    report[ch]={'total':total,'wins':wins,'losses':losses,'wr':wr,'non_gale_total':ng_t,'non_gale_wr':ng_wr,'unique_assets':len(assets),'directions':dict(dirs),'date_range':[dates[0][:10] if dates else '',dates[-1][:10] if dates else ''],'top_assets':dict(top5),'worst_assets':dict(bot5)}
    print(f"=== {ch} ===")
    print(f"  Total: {total}, WR: {wr}%, Non-gale WR: {ng_wr}% ({ng_t})")
    print(f"  Assets: {len(assets)}, Dirs: {dict(dirs)}")
    print(f"  Dates: {dates[0][:10] if dates else '?'} -> {dates[-1][:10] if dates else '?'}")
    print(f"  Best: {top5[:3]}")
    print(f"  Worst: {bot5[:3]}")

json.dump(report,open('intelligence/channel_analysis.json','w'),indent=2)
