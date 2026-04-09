import json
from collections import defaultdict
P=0.88;M1=(1+P)/P;M2=(1+M1+P)/P
BE2=(1+M1+M2)/((1+M1+M2)+P)
det=[t for t in json.load(open('intelligence/ops_report_trades.json')) if t['format']=='detailed']
print(f"N={len(det)} BE_MG2={BE2*100:.1f}%")
a=defaultdict(lambda:[0,0])
for t in det:a[t['asset']][0 if t['result']=='WIN' else 1]+=1
print("\nASSETS above BE (n>=30):")
for k in sorted(a,key=lambda x:-a[x][0]/(a[x][0]+a[x][1]) if sum(a[x])>=30 else 0):
    w,l=a[k];n=w+l
    if n<30:continue
    wr=w/n*100
    if wr>=BE2*100:print(f"  ✅ {k:20s} {wr:5.1f}% n={n}")
h=defaultdict(lambda:[0,0])
for t in det:
    if t['time']!='UNKNOWN':h[t['time'][:2]][0 if t['result']=='WIN' else 1]+=1
print("\nHOURS:")
for k in sorted(h):
    w,l=h[k];n=w+l;wr=w/n*100
    m='✅' if wr>=BE2*100 else '❌'
    print(f"  {m} {k}:00 {wr:5.1f}% n={n}")
