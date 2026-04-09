import json
from collections import defaultdict
P=0.88;M1=(1+P)/P;M2=(1+M1+P)/P
BE0=1/(1+P);BE1=(1+M1)/((1+M1)+P);BE2=(1+M1+M2)/((1+M1+M2)+P)

# TYL VIP ops reports - MG2+filter
det=[t for t in json.load(open('intelligence/ops_report_trades.json')) if t['format']=='detailed']
a=defaultdict(lambda:[0,0])
for t in det:a[t['asset']][0 if t['result']=='WIN' else 1]+=1
print(f"TYL_VIP (MG2, BE={BE2*100:.1f}%):")
for k in sorted(a,key=lambda x:-a[x][0]/max(sum(a[x]),1)):
    w,l=a[k];n=w+l
    if n<20:continue
    wr=w/n*100;ev=w/n*P-(1-w/n)*(1+M1+M2)
    if wr>=BE2*100:print(f"  OK {k:20s} WR={wr:.1f}% n={n} EV={ev:+.3f}")

# TYL TRADING - MG1
d2=json.load(open('db_import_tyl_trading.json'))
a2=defaultdict(lambda:defaultdict(int))
for s in d2:
    g=s.get('galeLevel',0) or 0;r=(s.get('result','') or '').lower();asset=s.get('asset','?')
    if r=='win':a2[asset][f'g{g}w']+=1
    elif r=='loss':a2[asset][f'g{g}l']+=1
print(f"\nTYL_TRADING (MG1, BE={BE1*100:.1f}%):")
for k in sorted(a2):
    v=a2[k];w=v['g0w']+v['g1w'];l=v['g2w']+v['g2l'];n=w+l
    if n<20:continue
    wr=w/n*100
    if wr>=BE1*100:print(f"  OK {k:20s} MG1WR={wr:.1f}% n={n}")

# SINAIS MIL - NoMG
d3=json.load(open('db_import_sinais_mil.json'))
a3=defaultdict(lambda:[0,0])
for s in d3:
    g=s.get('galeLevel',0) or 0;r=(s.get('result','') or '').lower();asset=s.get('asset','?')
    if g==0 and r=='win':a3[asset][0]+=1
    elif r:a3[asset][1]+=1
print(f"\nSINAIS_MIL (NoMG, BE={BE0*100:.1f}%):")
for k in sorted(a3,key=lambda x:-a3[x][0]/max(sum(a3[x]),1)):
    w,l=a3[k];n=w+l
    if n<20:continue
    wr=w/n*100;ev=w/n*P-(1-w/n)
    print(f"  {'OK' if wr>=BE0*100 else '--'} {k:20s} WR={wr:.1f}% n={n} EV={ev:+.3f}")

# BLACKLIST - NoMG
d4=json.load(open('db_import_blacklist.json'))
a4=defaultdict(lambda:[0,0])
for s in d4:
    g=s.get('galeLevel',0) or 0;r=(s.get('result','') or '').lower();asset=s.get('asset','?')
    if g==0 and r=='win':a4[asset][0]+=1
    elif r:a4[asset][1]+=1
print(f"\nBLACKLIST (NoMG, BE={BE0*100:.1f}%):")
for k in sorted(a4,key=lambda x:-a4[x][0]/max(sum(a4[x]),1)):
    w,l=a4[k];n=w+l
    if n<10:continue
    wr=w/n*100;ev=w/n*P-(1-w/n)
    print(f"  {'OK' if wr>=BE0*100 else '--'} {k:20s} WR={wr:.1f}% n={n} EV={ev:+.3f}")

# PRIVATE TEAM - check gale structure
pt=json.load(open('intelligence/parsed_private_team.json'))
ptw=sum(1 for s in pt if s.get('result')=='WIN')
ptl=sum(1 for s in pt if s.get('result')=='LOSS')
print(f"\nPRIVATE_TEAM: {ptw}W/{ptl}L WR={ptw/(ptw+ptl)*100:.1f}% (no gale data, reported as-is)")
pta=defaultdict(lambda:[0,0])
for s in pt:
    if s.get('result'):pta[s['asset']][0 if s['result']=='WIN' else 1]+=1
for k in sorted(pta,key=lambda x:-pta[x][0]/max(sum(pta[x]),1)):
    w,l=pta[k];n=w+l
    if n<5:continue
    wr=w/n*100
    if wr>=BE0*100:print(f"  OK {k:20s} WR={wr:.1f}% n={n}")
