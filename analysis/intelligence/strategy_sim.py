#!/usr/bin/env python3
"""Multi-strategy backtester for SnapTrade signals"""
import json,math
from collections import defaultdict
from datetime import datetime

data=json.load(open('intelligence/all_signals_unified.json'))
# Only signals with results, non-gale (gale_level 0 = first entry)
sigs=[s for s in data if s['result'] and s['result'].lower() in ('win','loss') and (s.get('gale_level',0) or 0)==0]
# Sort by date
sigs.sort(key=lambda x:x['date'])
print(f"Total non-gale signals with results: {len(sigs)}")

PAYOUT=0.88
INITIAL_BANK=1000

def masaniello_stake(bank, trades_left, wins_left, payout):
    if trades_left<=0 or wins_left<=0 or wins_left>trades_left:return 0
    if wins_left==trades_left:
        return bank/((1+payout)**wins_left-1)*payout if payout else 0
    try:
        # Simplified Masaniello formula
        ratio=wins_left/trades_left
        stake=bank*ratio/(payout*trades_left*0.5)
        return min(stake, bank*0.15)  # Cap at 15% of bank
    except:return bank*0.02

def simulate(signals, name, initial=INITIAL_BANK, tpd=15, ew=13):
    bank=initial;peak=initial;max_dd=0;wins=0;losses=0
    equity=[initial];daily_trades=0;last_date=''
    trades_left=tpd;wins_left=ew

    for s in signals:
        d=s['date'][:10]
        if d!=last_date:
            trades_left=tpd;wins_left=ew;last_date=d;daily_trades=0
        if trades_left<=0 or wins_left<=0:continue

        stake=masaniello_stake(bank,trades_left,wins_left,PAYOUT)
        stake=max(1,min(stake,bank*0.15))
        if stake>bank:continue

        if s['result'].lower()=='win':
            bank+=stake*PAYOUT;wins+=1;wins_left-=1
        else:
            bank-=stake;losses+=1
        trades_left-=1;daily_trades+=1

        if bank>peak:peak=bank
        dd=(peak-bank)/peak*100 if peak>0 else 0
        if dd>max_dd:max_dd=dd
        equity.append(bank)

        if bank<=0:break

    total=wins+losses
    return {'name':name,'final_bank':round(bank,2),'roi':round((bank-initial)/initial*100,1),'wins':wins,'losses':losses,'wr':round(wins/total*100,1) if total else 0,'max_dd':round(max_dd,1),'total_trades':total,'equity_len':len(equity)}

# STRATEGY 1: Baseline - all signals, Masaniello
r1=simulate(sigs,'BASELINE_ALL')
print(f"\n1. {r1['name']}: ROI={r1['roi']}% WR={r1['wr']}% MaxDD={r1['max_dd']}% Trades={r1['total_trades']} Final=${r1['final_bank']}")

# STRATEGY 2: Per-channel best (TYL VIP only - largest dataset)
tyl_vip=[s for s in sigs if s['channel']=='tyl_vip']
r2=simulate(tyl_vip,'TYL_VIP_ONLY')
print(f"2. {r2['name']}: ROI={r2['roi']}% WR={r2['wr']}% MaxDD={r2['max_dd']}% Trades={r2['total_trades']} Final=${r2['final_bank']}")

# STRATEGY 3: Smart Filter - exclude worst hours and assets
# Pre-compute bad hours (WR < 80%) and bad assets (WR < 75%)
hour_wr=defaultdict(lambda:{'w':0,'l':0})
asset_wr=defaultdict(lambda:{'w':0,'l':0})
for s in sigs[:int(len(sigs)*0.7)]:  # Train on first 70%
    try:
        dt=datetime.fromisoformat(s['date'].replace('Z','').split('+')[0])
        h=dt.hour
    except:h=-1
    r=s['result'].lower()
    if r=='win':hour_wr[h]['w']+=1;asset_wr[s['asset']]['w']+=1
    else:hour_wr[h]['l']+=1;asset_wr[s['asset']]['l']+=1

bad_hours=set()
for h,v in hour_wr.items():
    t=v['w']+v['l']
    if t>=20 and v['w']/t<0.80:bad_hours.add(h)
bad_assets=set()
for a,v in asset_wr.items():
    t=v['w']+v['l']
    if t>=15 and v['w']/t<0.75:bad_assets.add(a)

print(f"\nSmart Filter: {len(bad_hours)} bad hours, {len(bad_assets)} bad assets excluded")

filtered=[s for s in sigs if s['asset'] not in bad_assets]
# Add hour filter
filtered2=[]
for s in filtered:
    try:
        dt=datetime.fromisoformat(s['date'].replace('Z','').split('+')[0])
        if dt.hour not in bad_hours:filtered2.append(s)
    except:filtered2.append(s)

r3=simulate(filtered2,'SMART_FILTER')
print(f"3. {r3['name']}: ROI={r3['roi']}% WR={r3['wr']}% MaxDD={r3['max_dd']}% Trades={r3['total_trades']} Final=${r3['final_bank']}")

# STRATEGY 4: Top channels only (blacklist + tyl_vip + private_team - highest WR)
top_ch=[s for s in sigs if s['channel'] in ('blacklist','tyl_vip','private_team')]
r4=simulate(top_ch,'TOP_CHANNELS')
print(f"4. {r4['name']}: ROI={r4['roi']}% WR={r4['wr']}% MaxDD={r4['max_dd']}% Trades={r4['total_trades']} Final=${r4['final_bank']}")

# STRATEGY 5: Aggressive Masaniello (higher expected wins)
r5=simulate(sigs,'AGGRESSIVE_MASANIELLO',tpd=15,ew=14)
print(f"5. {r5['name']}: ROI={r5['roi']}% WR={r5['wr']}% MaxDD={r5['max_dd']}% Trades={r5['total_trades']} Final=${r5['final_bank']}")

# STRATEGY 6: Conservative Masaniello (lower expected wins)
r6=simulate(sigs,'CONSERVATIVE_MASANIELLO',tpd=15,ew=12)
print(f"6. {r6['name']}: ROI={r6['roi']}% WR={r6['wr']}% MaxDD={r6['max_dd']}% Trades={r6['total_trades']} Final=${r6['final_bank']}")

# Out-of-sample validation (last 30%)
oos_sigs=sigs[int(len(sigs)*0.7):]
print(f"\n=== OUT-OF-SAMPLE (last 30%, {len(oos_sigs)} signals) ===")
for name,params in [('OOS_BASELINE',{}),('OOS_SMART_FILTER',{'filter':True}),('OOS_CONSERVATIVE',{'ew':12})]:
    s_list=oos_sigs
    if params.get('filter'):
        s_list=[s for s in oos_sigs if s['asset'] not in bad_assets]
        s_list2=[]
        for s in s_list:
            try:
                dt=datetime.fromisoformat(s['date'].replace('Z','').split('+')[0])
                if dt.hour not in bad_hours:s_list2.append(s)
            except:s_list2.append(s)
        s_list=s_list2
    ew=params.get('ew',13)
    r=simulate(s_list,name,ew=ew)
    print(f"  {r['name']}: ROI={r['roi']}% WR={r['wr']}% MaxDD={r['max_dd']}% Trades={r['total_trades']} Final=${r['final_bank']}")

results=[r1,r2,r3,r4,r5,r6]
json.dump(results,open('intelligence/strategy_results.json','w'),indent=2)
