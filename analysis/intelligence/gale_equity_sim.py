import json
d=json.load(open('seed_signals.json'))
d.sort(key=lambda x:x.get('entry_time_utc','') or x.get('created_at',''))
P=0.88;I=1000;SP=0.02
M1=(1+P)/P;M2=(1+M1+P)/P
# Build chain-based sequence for simulation
# Each chain = one trading decision (GL0, then maybe GL1, GL2)
chains=[];cur=[]
for s in d:
    g=s.get('gale_level',0) or 0
    r=(s.get('result','') or '').lower()
    if not r:continue
    if g==0:
        if cur:chains.append(cur)
        cur=[(g,r,s.get('entry_time_utc','') or s.get('created_at',''))]
    else:
        cur.append((g,r,s.get('entry_time_utc','') or s.get('created_at','')))
if cur:chains.append(cur)
print(f"Chains: {len(chains)}")
# Sim A: no MG
bA=I;peakA=I;ddA=0;eqA=[]
for c in chains:
    s=bA*SP
    if s<=0 or bA<=0:eqA.append(0);continue
    g0r=c[0][1]
    if g0r=='win':bA+=s*P
    else:bA-=s
    if bA>peakA:peakA=bA
    dd=(peakA-bA)/peakA*100;ddA=max(ddA,dd)
    eqA.append(round(bA,2))
# Sim B: max MG1
bB=I;peakB=I;ddB=0;eqB=[]
for c in chains:
    s=bB*SP
    if s<=0 or bB<=0:eqB.append(0);continue
    g0r=c[0][1]
    if g0r=='win':
        bB+=s*P
    else:
        # GL0 lost, try GL1
        bB-=s  # lose GL0
        s1=s*M1
        if len(c)>1 and c[1][1]=='win':
            bB+=s1*P  # GL1 win
        else:
            bB-=s1  # GL1 loss, stop
    if bB>peakB:peakB=bB
    dd=(peakB-bB)/peakB*100;ddB=max(ddB,dd)
    eqB.append(round(bB,2))
# Sim C: full MG2
bC=I;peakC=I;ddC=0;eqC=[]
for c in chains:
    s=bC*SP
    if s<=0 or bC<=0:eqC.append(0);continue
    g0r=c[0][1]
    if g0r=='win':
        bC+=s*P
    else:
        bC-=s
        s1=s*M1
        if len(c)>1 and c[1][1]=='win':
            bC+=s1*P
        else:
            bC-=s1
            s2=s*M2
            if len(c)>2 and c[2][1]=='win':
                bC+=s2*P
            else:
                bC-=s2
    if bC>peakC:peakC=bC
    dd=(peakC-bC)/peakC*100;ddC=max(ddC,dd)
    eqC.append(round(bC,2))
print(f"A)NoMG:  final=${bA:,.0f} maxDD={ddA:.1f}%")
print(f"B)MG1:   final=${bB:,.0f} maxDD={ddB:.1f}%")
print(f"C)MG2:   final=${bC:,.0f} maxDD={ddC:.1f}%")
json.dump({'A':eqA[-20:],'B':eqB[-20:],'C':eqC[-20:],'finalA':round(bA,2),'finalB':round(bB,2),'finalC':round(bC,2),'ddA':round(ddA,1),'ddB':round(ddB,1),'ddC':round(ddC,1)},open('intelligence/gale_equity_curves.json','w'))
