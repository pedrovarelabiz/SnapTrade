import json
from collections import defaultdict
from datetime import datetime
d=json.load(open('seed_signals.json'))
P=0.88;BE=1/(1+P)
# Each signal: what would happen WITHOUT gale?
# GL0+win = WIN, everything else = LOSS at GL0
sigs=[]
for s in d:
    gl=s.get('gale_level',0) or 0
    r=(s.get('result','') or '').lower()
    if not r:continue
    real='W' if gl==0 and r=='win' else 'L'
    dt=s.get('entry_time_utc','') or s.get('created_at','')
    try:h=int(dt[11:13])
    except:h=-1
    try:dow=datetime.fromisoformat(dt[:19]).strftime('%A')
    except:dow='?'
    sigs.append({'asset':s.get('asset','?'),'real':real,'h':h,'dow':dow,'date':dt[:10]})

# BY ASSET (min 50 signals)
print("=== ASSETS WITH EDGE (WR > 53.2%, min 50 sigs) ===")
ast=defaultdict(lambda:{'W':0,'L':0})
for s in sigs:
    ast[s['asset']][s['real']]+=1
profitable=[]
for a,v in sorted(ast.items()):
    t=v['W']+v['L']
    if t<50:continue
    wr=v['W']/t
    ev=wr*P-(1-wr)
    if wr>BE:
        profitable.append((a,wr,t,ev))
        print(f"  ✅ {a:20s} WR={wr*100:5.1f}% n={t:4d} EV={ev:+.3f}")
# Also show worst
print(f"\nTotal assets with edge (>53.2%): {len(profitable)}")
print(f"\n=== WORST ASSETS ===")
worst=sorted([(a,v['W']/(v['W']+v['L']),v['W']+v['L']) for a,v in ast.items() if v['W']+v['L']>=50],key=lambda x:x[1])
for a,wr,n in worst[:10]:
    print(f"  ❌ {a:20s} WR={wr*100:5.1f}% n={n}")

# BY HOUR
print(f"\n=== HOURS WITH EDGE (WR > 53.2%) ===")
hr=defaultdict(lambda:{'W':0,'L':0})
for s in sigs:
    if s['h']>=0:hr[s['h']][s['real']]+=1
for h in sorted(hr.keys()):
    v=hr[h];t=v['W']+v['L'];wr=v['W']/t
    ev=wr*P-(1-wr)
    mark='✅' if wr>BE else '❌'
    print(f"  {mark} {h:02d}:00 WR={wr*100:5.1f}% n={t:4d} EV={ev:+.4f}")

# BY DAY
print(f"\n=== DAYS WITH EDGE ===")
dw=defaultdict(lambda:{'W':0,'L':0})
for s in sigs:
    dw[s['dow']][s['real']]+=1
for d2 in ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']:
    v=dw.get(d2,{'W':0,'L':0});t=v['W']+v['L']
    if t==0:continue
    wr=v['W']/t;ev=wr*P-(1-wr)
    mark='✅' if wr>BE else '❌'
    print(f"  {mark} {d2:10s} WR={wr*100:5.1f}% n={t:4d} EV={ev:+.4f}")

# COMBINED: only profitable assets + profitable hours
print(f"\n=== COMBINED FILTER: profitable assets + hours ===")
good_assets=set(a for a,wr,n,ev in profitable)
good_hours=set(h for h,v in hr.items() if v['W']/(v['W']+v['L'])>BE and v['W']+v['L']>=30)
print(f"Good assets: {len(good_assets)}, Good hours: {good_hours}")
filt=[s for s in sigs if s['asset'] in good_assets and s['h'] in good_hours]
fw=sum(1 for s in filt if s['real']=='W')
ft=len(filt)
if ft:
    fwr=fw/ft;fev=fwr*P-(1-fwr)
    print(f"Filtered: {ft} signals, WR={fwr*100:.1f}%, EV={fev:+.4f}")
