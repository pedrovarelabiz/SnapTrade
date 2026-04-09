#!/usr/bin/env python3
import json, re, os
import sentry_sdk
INPUT = "raw_messages_vip_otc_market.json"
OUTPUT_DIR = "intelligence"
msgs = json.load(open(INPUT))
sig_pat = re.compile(r'([A-Z]{3}/[A-Z]{3,4}).*?OTC.*?(SELL|BUY)', re.I|re.DOTALL)
sess_pat = re.compile(r'Total\s+signals?\s*=\s*(\d+).*?ITM\s*=\s*(\d+).*?OTM\s*=\s*(\d+)', re.I|re.DOTALL)
signals=[];sessions=[]
for m in msgs:
    try:
        t=m.get('text','')
        if isinstance(t,list):t=' '.join(str(x) for x in t)
        t=str(t)
        sm=sig_pat.search(t)
        if sm and 'Candle' in t:
            d2=sm.group(2).upper()
            if d2=='SELL':d2='PUT'
            if d2=='BUY':d2='CALL'
            signals.append({'msg_id':m.get('id'),'date':m.get('date',''),'asset':sm.group(1).replace('/','')+'_otc','direction':d2,'exp':1,'ch':'vip_otc_market'})
        ss=sess_pat.search(t)
        if ss:sessions.append({'date':m.get('date',''),'total':int(ss.group(1)),'wins':int(ss.group(2)),'losses':int(ss.group(3))})
    except Exception as e:
        with sentry_sdk.push_scope() as scope:
            scope.set_tag("parser", "vip_otc_market")
            scope.set_context("message", {"msg_id": m.get('id'), "date": m.get('date', '')})
            sentry_sdk.capture_exception(e)
tw=sum(s['wins'] for s in sessions);tl=sum(s['losses'] for s in sessions);tt=tw+tl
print(f"Signals:{len(signals)} Sessions:{len(sessions)} Total:{tt} W:{tw} L:{tl} WR:{round(tw/tt*100,1) if tt else 0}%")
print(f"Assets:{len(set(s['asset'] for s in signals))}")
if signals:print(f"Dates:{signals[0]['date'][:10]} -> {signals[-1]['date'][:10]}")
json.dump(signals,open(f"{OUTPUT_DIR}/parsed_vip_otc.json","w"),indent=2)
json.dump(sessions,open(f"{OUTPUT_DIR}/vip_otc_sessions.json","w"),indent=2)
