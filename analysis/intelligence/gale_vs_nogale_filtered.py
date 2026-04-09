import json
P=0.88;M1=(1+P)/P;M2=(1+M1+P)/P
# From seed_signals: GL distribution among WINS
# GL0w=3958, GL1w=2008, GL2w=1002 => total wins=6968
# P(GL0|win)=0.568, P(GL1|win)=0.288, P(GL2|win)=0.144
PG0W=0.568;PG1W=0.288;PG2W=0.144
good_assets={'NZDUSD_otc','AUDCAD_otc','USDCOP_otc','CADJPY_otc'}
# For each scenario, estimate EV at different reported WRs
print("=== EV BY REPORTED WR AND GALE SCENARIO ===")
print(f"{'WR':>6s} {'NoMG_EV':>10s} {'MG1_EV':>10s} {'MG2_EV':>10s} {'Best':>8s}")
for wr_pct in range(80,98):
    wr=wr_pct/100
    lr=1-wr
    # Decompose reported WR into GL levels
    g0=wr*PG0W;g1=wr*PG1W;g2w=wr*PG2W;g2l=lr
    # NoMG: only GL0 wins count, rest are losses
    ev_a=g0*P-(1-g0)*1
    # MG1: GL0+GL1 win, GL2w+GL2l are losses at MG1
    ev_b=g0*P+g1*(P*M1-1)-(g2w+g2l)*(1+M1)
    # MG2: current
    ev_c=g0*P+g1*(P*M1-1)+g2w*(P*M2-1-M1)-g2l*(1+M1+M2)
    best='NoMG' if ev_a>=ev_b and ev_a>=ev_c else ('MG1' if ev_b>=ev_c else 'MG2')
    mark='<<<' if ev_c>0 and best=='MG2' else ''
    print(f"  {wr_pct}%  {ev_a:+9.4f}  {ev_b:+9.4f}  {ev_c:+9.4f}  {best:>6s} {mark}")

# Now simulate ALL 3 scenarios on filtered ops trades
det=[t for t in json.load(open('intelligence/ops_report_trades.json')) if t['format']=='detailed' and t['asset'] in good_assets]
det.sort(key=lambda x:x['date']+x['time'])
print(f"\nFiltered trades (good assets): {len(det)}")
I=1000;SP=0.02
# Simulate MG2 on filtered
b=I
for t in det:
    s=b*SP
    if s<=0 or b<=0:break
    if t['result']=='WIN':b+=s*P
    else:b-=s*(1+M1+M2)
print(f"MG2 filtered: ${b:,.0f} (ROI={((b-I)/I*100):+.0f}%)")
# We can't simulate NoMG/MG1 directly from ops reports because we don't know GL level per trade
# But we can estimate using the GL distribution
# For each WIN in ops, random split: 56.8% GL0, 28.8% GL1, 14.4% GL2
import random
random.seed(42)
for label,max_gl in [('NoMG',0),('MG1',1),('MG2',2)]:
    results=[]
    for _ in range(100):  # 100 Monte Carlo runs
        b=I
        for t in det:
            s=b*SP
            if s<=0 or b<=0:break
            if t['result']=='WIN':
                r=random.random()
                if r<PG0W:gl=0
                elif r<PG0W+PG1W:gl=1
                else:gl=2
                if gl<=max_gl:
                    # Won at this GL level
                    cost=sum([1,M1,M2][:gl])
                    profit=P*[1,M1,M2][gl]
                    b+=s*(profit-cost) if gl>0 else s*P
                else:
                    # Would have lost - stop at max_gl
                    cost=sum([1,M1,M2][:max_gl+1])
                    b-=s*cost
            else:
                cost=sum([1,M1,M2][:max_gl+1])
                b-=s*cost
        results.append(b)
    med=sorted(results)[50]
    avg=sum(results)/len(results)
    p5=sorted(results)[5]
    print(f"{label}: median=${med:,.0f} avg=${avg:,.0f} p5=${p5:,.0f}")
