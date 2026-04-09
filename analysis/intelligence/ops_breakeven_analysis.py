import json
from collections import defaultdict
P=0.88
M1=(1+P)/P;M2=(1+M1+P)/P
# Breakeven WRs for ops reports (where WIN/LOSS = after full gale cycle)
# At MG2: each WIN nets +P, each LOSS costs -(1+M1+M2)
BE_MG2=((1+M1+M2))/((1+M1+M2)+P)
# At MG1: WIN at ops level means won at GL0 or GL1
# But from ops we can't distinguish. Use seed_signals distribution:
# Of all WINs: 56.8% are GL0, 28.8% GL1, 14.4% GL2
# In MG1 mode: GL2 would be losses. So reported WR overcounts.
# Simpler: just find subsets of ops reports with high enough WR
print(f"Breakeven WRs: MG2={BE_MG2*100:.1f}%, MG1~92%, NoMG=53.2%")

trades=json.load(open('intelligence/ops_report_trades.json'))
det=[t for t in trades if t['format']=='detailed']
print(f"\nDetailed trades: {len(det)}")

# BY ASSET (min 30)
ast=defaultdict(lambda:{'W':0,'L':0})
for t in det:
    k='W' if t['result']=='WIN' else 'L'
    ast[t['asset']][k]+=1

print(f"\n=== ASSETS BY REPORTED WR (n>=30) ===")
print(f"{'Asset':20s} {'WR':>7s} {'N':>5s} {'W':>5s} {'L':>4s} {'MG2?':>5s}")
ranked=[]
for a,v in ast.items():
    n=v['W']+v['L']
    if n<30:continue
    wr=v['W']/n*100
    ranked.append((a,wr,n,v['W'],v['L']))
ranked.sort(key=lambda x:-x[1])
for a,wr,n,w,l in ranked:
    mg2='✅' if wr>BE_MG2*100 else '❌'
    print(f"  {a:20s} {wr:6.1f}% {n:5d} {w:5d} {l:4d} {mg2}")

above_be=sum(1 for _,wr,_,_,_ in ranked if wr>BE_MG2*100)
print(f"\nAssets above MG2 breakeven ({BE_MG2*100:.1f}%): {above_be}/{len(ranked)}")

# BY HOUR
hr=defaultdict(lambda:{'W':0,'L':0})
for t in det:
    if t['time']!='UNKNOWN':
        k='W' if t['result']=='WIN' else 'L'
        hr[t['time'][:2]][k]+=1

print(f"\n=== HOURS BY REPORTED WR ===")
for h in sorted(hr.keys()):
    v=hr[h];n=v['W']+v['L'];wr=v['W']/n*100
    mg2='✅' if wr>BE_MG2*100 else '❌'
    bar='█'*int(wr/2)
    print(f"  {h}:00 WR={wr:5.1f}% n={n:5d} {mg2} {bar}")

# BEST COMBOS: asset+hour above BE
print(f"\n=== TOP ASSET+HOUR COMBOS (WR>{BE_MG2*100:.0f}%, n>=15) ===")
combo=defaultdict(lambda:{'W':0,'L':0})
for t in det:
    if t['time']!='UNKNOWN':
        ck=f"{t['asset']}@{t['time'][:2]}"
        rk='W' if t['result']=='WIN' else 'L'
        combo[ck][rk]+=1
top=[]
for k,v in combo.items():
    n=v['W']+v['L']
    if n>=15:
        wr=v['W']/n*100
        if wr>=BE_MG2*100:
            top.append((k,wr,n,v['W'],v['L']))
top.sort(key=lambda x:(-x[1],-x[2]))
for k,wr,n,w,l in top[:20]:
    print(f"  {k:30s} WR={wr:5.1f}% n={n:3d} ({w}W/{l}L)")
print(f"\nTotal profitable combos: {len(top)}")
tw=sum(v['W'] for k,v in combo.items() if v['W']+v['L']>=15 and v['W']/(v['W']+v['L'])>=BE_MG2)
tn=sum(v['W']+v['L'] for k,v in combo.items() if v['W']+v['L']>=15 and v['W']/(v['W']+v['L'])>=BE_MG2)
if tn:print(f"Combined filtered pool: {tn} trades, WR={tw/tn*100:.1f}%")
