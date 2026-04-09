#!/usr/bin/env python3
import json
from collections import Counter
d=json.load(open('seed_signals.json'))
PAYOUT=0.88
gl_dist=Counter()
for s in d:
    gl=s.get('gale_level',0) or 0
    r=(s.get('result','') or '').lower()
    if r: gl_dist[f'GL{gl}_{r}']+=1
g0w=gl_dist.get('GL0_win',0)
g1w=gl_dist.get('GL1_win',0)
g2w=gl_dist.get('GL2_win',0)
g2l=gl_dist.get('GL2_loss',0)
T=g0w+g1w+g2w+g2l
G0=1.0
G1=(G0+G0*PAYOUT)/PAYOUT
G2=(G0+G1+G0*PAYOUT)/PAYOUT
print(f"Distribution: GL0w={g0w}({g0w/T*100:.1f}%) GL1w={g1w}({g1w/T*100:.1f}%) GL2w={g2w}({g2w/T*100:.1f}%) GL2l={g2l}({g2l/T*100:.1f}%)")
print(f"Multipliers: G0={G0:.2f} G1={G1:.3f} G2={G2:.3f}")
# Scenario A: NO MG
aW=g0w;aL=T-g0w;aEV=(aW*PAYOUT-aL)/T
print(f"\nA) NO MG: WR={aW/T*100:.1f}% EV={aEV:+.4f}x Net={aEV*T:+.0f}x  {'PROFIT' if aEV>0 else 'LOSS'}")
print(f"   {aW}W x +{PAYOUT:.2f} = +{aW*PAYOUT:.0f}  |  {aL}L x -1 = -{aL:.0f}  |  Net={aW*PAYOUT-aL:+.0f}")
# Scenario B: MAX MG1
bW=g0w+g1w;bL=g2w+g2l
bP=g0w*(PAYOUT*G0)+g1w*(PAYOUT*G1-G0)
bC=bL*(G0+G1)
bEV=(bP-bC)/T
print(f"\nB) MAX MG1: WR={bW/T*100:.1f}% EV={bEV:+.4f}x Net={bP-bC:+.0f}x  {'PROFIT' if bEV>0 else 'LOSS'}")
print(f"   GL0w: {g0w} x +{PAYOUT*G0:.3f} = +{g0w*PAYOUT*G0:.0f}")
print(f"   GL1w: {g1w} x +{PAYOUT*G1-G0:.3f} = +{g1w*(PAYOUT*G1-G0):.0f}")
print(f"   MG1L: {bL} x -{G0+G1:.3f} = -{bL*(G0+G1):.0f}")
# Scenario C: FULL MG2
cP=g0w*(PAYOUT*G0)+g1w*(PAYOUT*G1-G0)+g2w*(PAYOUT*G2-G0-G1)
cC=g2l*(G0+G1+G2)
cEV=(cP-cC)/T
print(f"\nC) FULL MG2: WR={(g0w+g1w+g2w)/T*100:.1f}% EV={cEV:+.4f}x Net={cP-cC:+.0f}x  {'PROFIT' if cEV>0 else 'LOSS'}")
print(f"   GL0w: {g0w} x +{PAYOUT*G0:.3f} = +{g0w*PAYOUT*G0:.0f}")
print(f"   GL1w: {g1w} x +{PAYOUT*G1-G0:.3f} = +{g1w*(PAYOUT*G1-G0):.0f}")
print(f"   GL2w: {g2w} x +{PAYOUT*G2-G0-G1:.3f} = +{g2w*(PAYOUT*G2-G0-G1):.0f}")
print(f"   GL2l: {g2l} x -{G0+G1+G2:.3f} = -{g2l*(G0+G1+G2):.0f}")
r={'T':T,'dist':{'g0w':g0w,'g1w':g1w,'g2w':g2w,'g2l':g2l},'mult':{'G0':G0,'G1':round(G1,3),'G2':round(G2,3)},'A':{'wr':round(aW/T*100,1),'ev':round(aEV,4)},'B':{'wr':round(bW/T*100,1),'ev':round(bEV,4)},'C':{'wr':round((g0w+g1w+g2w)/T*100,1),'ev':round(cEV,4)}}
json.dump(r,open('intelligence/gale_scenario_analysis.json','w'),indent=2)
