import json
from collections import defaultdict
P=0.88;M1=(1+P)/P;M2=(1+M1+P)/P;I=1000;SP=0.02
good_vip={'NZDUSD_otc','AUDCAD_otc','CADJPY_otc','USDCOP_otc','GBPAUD_otc','USDINR_otc'}
pool=[]
# TYL VIP MG2 filtered
for t in json.load(open('intelligence/ops_report_trades.json')):
    if t.get('format')!='detailed' or t['asset'] not in good_vip:continue
    pool.append((t['date'],'vip','WIN' if t['result']=='WIN' else 'LOSS',P,1+M1+M2))
# Sinais Mil NoMG
for s in json.load(open('db_import_sinais_mil.json')):
    g=s.get('galeLevel',0) or 0;r=(s.get('result','') or '').lower()
    if g==0 and r in ('win','loss'):
        pool.append((s.get('entryTimeUtc','')[:10],'sm','WIN' if r=='win' else 'LOSS',P,1.0))
# Blacklist NoMG
for s in json.load(open('db_import_blacklist.json')):
    g=s.get('galeLevel',0) or 0;r=(s.get('result','') or '').lower()
    if g==0 and r in ('win','loss'):
        pool.append((s.get('entryTimeUtc','')[:10],'bl','WIN' if r=='win' else 'LOSS',P,1.0))
# TYL Trading MG1 chains
d2=json.load(open('db_import_tyl_trading.json'))
d2.sort(key=lambda x:x.get('entryTimeUtc',''))
chains=[];cur=[]
for s in d2:
    g=s.get('galeLevel',0) or 0;r=(s.get('result','') or '').lower()
    if not r:continue
    if g==0:
        if cur:chains.append(cur)
        cur=[(g,r,s.get('entryTimeUtc',''))]
    else:cur.append((g,r,s.get('entryTimeUtc','')))
if cur:chains.append(cur)
for c in chains:
    dt=c[0][2][:10]
    if c[0][1]=='win':pool.append((dt,'tt','WIN',P,0))
    elif len(c)>1 and c[1][1]=='win':pool.append((dt,'tt','WIN',P*M1-1,0))
    else:pool.append((dt,'tt','LOSS',0,1+M1))
pool.sort(key=lambda x:x[0])
# Simulate each channel + combined
for label,filt in [('TYL_VIP_filt','vip'),('TYL_TRAD_MG1','tt'),('SINAIS_MIL','sm'),('BLACKLIST','bl'),('ALL','*')]:
    b=I;pk=I;mdd=0;w=0;l=0
    for dt,ch,res,pm,lm in pool:
        if filt!='*' and ch!=filt:continue
        st=b*SP
        if st<=0 or b<=0:break
        if res=='WIN':b+=st*pm;w+=1
        else:b-=st*lm;l+=1
        if b>pk:pk=b
        dd=(pk-b)/pk*100 if pk>0 else 100
        mdd=max(mdd,dd)
    t=w+l;wr=w/t*100 if t else 0
    print(f"{label:18s} ${b:>14,.0f} WR={wr:.1f}% DD={mdd:.1f}% N={t}")
