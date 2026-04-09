import json
d=json.load(open('seed_signals.json'))
d.sort(key=lambda x:x.get('entry_time_utc','') or x.get('created_at',''))
P=0.88;I=1000;SP=0.02
M1=(1+P)/P;M2=(1+M1+P)/P
# Each signal IS a complete chain. gale_level = resolution level
sigs=[(s.get('gale_level',0) or 0,(s.get('result','') or '').lower()) for s in d if (s.get('result','') or '').lower() in ('win','loss')]
print(f"Signals: {len(sigs)}")
def sim(sigs,max_gale,label):
    b=I;pk=I;mdd=0
    wins=0;losses=0
    for gl,r in sigs:
        s=b*SP
        if s<=0 or b<=0:break
        if gl==0 and r=='win':
            b+=s*P;wins+=1
        elif gl==1 and r=='win':
            if max_gale>=1:
                b-=s;b+=s*M1*P;wins+=1  # lost G0, won G1
            else:
                b-=s;losses+=1  # no MG: just lose at G0
        elif gl==2 and r=='win':
            if max_gale>=2:
                b-=s;b-=s*M1;b+=s*M2*P;wins+=1  # lost G0+G1, won G2
            elif max_gale>=1:
                b-=s;b-=s*M1;losses+=1  # MG1 only: lose at G0+G1
            else:
                b-=s;losses+=1  # no MG: lose at G0
        elif gl==2 and r=='loss':
            if max_gale>=2:
                b-=s;b-=s*M1;b-=s*M2;losses+=1  # lost all 3
            elif max_gale>=1:
                b-=s;b-=s*M1;losses+=1  # lost G0+G1
            else:
                b-=s;losses+=1  # lost G0
        if b>pk:pk=b
        dd=(pk-b)/pk*100 if pk>0 else 100
        mdd=max(mdd,dd)
    total=wins+losses
    wr=wins/total*100 if total else 0
    print(f"{label:20s} Final=${b:>12,.2f} WR={wr:.1f}% MaxDD={mdd:.1f}% W={wins} L={losses}")
    return b,mdd,wr

sim(sigs,0,"A) No Martingale")
sim(sigs,1,"B) Max MG1")
sim(sigs,2,"C) Full MG2")
