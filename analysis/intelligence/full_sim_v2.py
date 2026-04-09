import json
from collections import defaultdict
P=0.88;M1=(1+P)/P;M2=(1+M1+P)/P;I=1000;SP=0.02

def sim(signals,label):
    b=I;pk=I;mdd=0;w=0;l=0
    for r,pm,lm in signals:
        s=b*SP
        if s<=0 or b<=0:break
        if r=='W':b+=s*pm;w+=1
        else:b-=s*lm;l+=1
        if b>pk:pk=b
        dd=(pk-b)/pk*100 if pk>0 else 100
        mdd=max(mdd,dd)
    t=w+l;wr=w/t*100 if t else 0
    print(f"{label:30s} ${b:>14,.0f} WR={wr:.1f}% DD={mdd:.1f}% N={t}")
    return b,mdd

# 1. SINAIS MIL MG1
sigs=json.load(open('intelligence/full_sinais_mil.json'))
sm=[];
for s in [x for x in sigs if x.get('result') and x['asset']!='CADCHF_otc']:
    if s['gale_level']==0:sm.append(('W',P,0))
    elif s['result']=='WIN':sm.append(('W',P*M1-1,0))
    else:sm.append(('L',0,1+M1))
sim(sm,'SM MG1 (excl CADCHF)')

# 2. SINAIS MIL NoMG
sm0=[]
for s in [x for x in sigs if x.get('result') and x['asset']!='CADCHF_otc']:
    if s['gale_level']==0:sm0.append(('W',P,0))
    else:sm0.append(('L',0,1.0))
sim(sm0,'SM NoMG')

# 3. PRIVATE TEAM (as-is, treat as NoMG since no gale data)
pt=json.load(open('intelligence/full_private_team.json'))
pt_sigs=[('W' if s['result']=='WIN' else 'L',P,1.0) for s in pt if s.get('result')]
sim(pt_sigs,'PrivateTeam as-is')

# 4. TYL Trading MG1 (from db_import chains)
d2=json.load(open('db_import_tyl_trading.json'))
d2.sort(key=lambda x:x.get('entryTimeUtc',''))
chains=[];cur=[]
for s in d2:
    g=s.get('galeLevel',0) or 0;r=(s.get('result','') or '').lower()
    if not r:continue
    if g==0:
        if cur:chains.append(cur)
        cur=[(g,r)]
    else:cur.append((g,r))
if cur:chains.append(cur)
tt=[]
for c in chains:
    if len(c)==1 and c[0][1]=='win':tt.append(('W',P,0))
    elif len(c)>=2 and c[1][1]=='win':tt.append(('W',P*M1-1,0))
    else:tt.append(('L',0,1+M1))
sim(tt,'TT MG1')

# 5. BLACKLIST MG1
bl=json.load(open('intelligence/full_blacklist.json'))
bl_sigs=[]
for s in [x for x in bl if x.get('result')]:
    if s['gale_level']==0:bl_sigs.append(('W',P,0))
    elif s['result']=='WIN':bl_sigs.append(('W',P*M1-1,0))
    else:bl_sigs.append(('L',0,1+M1))
sim(bl_sigs,'BL MG1')

# 6. COMBINED: SM_MG1 + PT + TT_MG1
# Sort all by date
all_dated=[]
for s in [x for x in sigs if x.get('result') and x['asset']!='CADCHF_otc']:
    if s['gale_level']==0:all_dated.append((s['date'],'W',P,0))
    elif s['result']=='WIN':all_dated.append((s['date'],'W',P*M1-1,0))
    else:all_dated.append((s['date'],'L',0,1+M1))
for s in [x for x in pt if x.get('result')]:
    all_dated.append((s['date'],'W' if s['result']=='WIN' else 'L',P,1.0))
for i,c in enumerate(chains):
    dt=d2[0].get('entryTimeUtc','')  # approximate
    if len(c)==1 and c[0][1]=='win':all_dated.append((dt,'W',P,0))
    elif len(c)>=2 and c[1][1]=='win':all_dated.append((dt,'W',P*M1-1,0))
    else:all_dated.append((dt,'L',0,1+M1))
all_dated.sort(key=lambda x:x[0])
combined=[(r,pm,lm) for _,r,pm,lm in all_dated]
sim(combined,'COMBINED (SM+PT+TT)')
