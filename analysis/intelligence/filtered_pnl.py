import json
from collections import defaultdict
P=0.88;M1=(1+P)/P;M2=(1+M1+P)/P;BE2=(1+M1+M2)/((1+M1+M2)+P)
det=[t for t in json.load(open('intelligence/ops_report_trades.json')) if t['format']=='detailed']
# Find profitable assets (WR >= BE2)
a=defaultdict(lambda:[0,0])
for t in det:a[t['asset']][0 if t['result']=='WIN' else 1]+=1
good_a=set(k for k,(w,l) in a.items() if w+l>=30 and w/(w+l)>=BE2)
# Sim with filter
I=1000;SP=0.02
# Full (no filter)
b1=I;b2=I;b3=I
# Filtered (only good assets)
f1=I;f2=I;f3=I
ct={'full':[0,0],'filt':[0,0]}
for t in det:
    is_good=t['asset'] in good_a
    r=t['result']
    for label,bank,filt in [('full',True,False),('filt',is_good,True)]:
        if not bank and filt:continue
        if not (True if label=='full' else is_good):continue
    # Full set - MG2
    s=b1*SP
    if s>0 and b1>0:
        if r=='WIN':b1+=s*P;ct['full'][0]+=1
        else:b1-=s*(1+M1+M2);ct['full'][1]+=1
    # Filtered - MG2
    if is_good:
        s=f1*SP
        if s>0 and f1>0:
            if r=='WIN':f1+=s*P;ct['filt'][0]+=1
            else:f1-=s*(1+M1+M2);ct['filt'][1]+=1

print(f"Good assets: {good_a}")
print(f"Full: {ct['full'][0]}W/{ct['full'][1]}L = ${b1:,.2f}")
print(f"Filt: {ct['filt'][0]}W/{ct['filt'][1]}L = ${f1:,.2f}")
# Now per-asset P&L
print(f"\nPer-asset P&L (MG2, 2% stake, $1000 start):")
for asset in sorted(good_a):
    b=1000
    w=0;l=0
    for t in det:
        if t['asset']!=asset:continue
        s=b*SP
        if s<=0 or b<=0:break
        if t['result']=='WIN':b+=s*P;w+=1
        else:b-=s*(1+M1+M2);l+=1
    n=w+l;wr=w/n*100 if n else 0
    print(f"  {asset:20s} WR={wr:5.1f}% n={n:4d} Final=${b:>12,.2f} ROI={((b-1000)/1000*100):>8.1f}%")
# Also: what about top 10 assets by volume that are above 88%?
print(f"\nAssets 88-89.7% WR (close to breakeven):")
near=[(k,w/(w+l)*100,w+l,w,l) for k,(w,l) in a.items() if w+l>=50 and 88<=w/(w+l)*100<BE2*100]
near.sort(key=lambda x:-x[2])
for k,wr,n,w,l in near[:10]:
    ev=w/n*P-(1-w/n)*(1+M1+M2)
    print(f"  {k:20s} WR={wr:5.1f}% n={n:4d} EV={ev:+.3f}")
