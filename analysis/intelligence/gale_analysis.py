import json
from collections import Counter
d=json.load(open('seed_signals.json'))
P=0.88
c=Counter()
for s in d:
    g=s.get('gale_level',0) or 0
    r=(s.get('result','') or '').lower()
    if r:c[f'{g}{r}']+=1
g0=c['0win'];g1=c['1win'];g2w=c['2win'];g2l=c['2loss']
T=g0+g1+g2w+g2l
M1=(1+P)/P;M2=(1+M1+P)/P
print(f"N={T} G0w={g0}({g0*100//T}%) G1w={g1}({g1*100//T}%) G2w={g2w}({g2w*100//T}%) G2l={g2l}({g2l*100//T}%)")
print(f"Mult: M0=1 M1={M1:.3f} M2={M2:.3f}")
a=g0*P-(T-g0);print(f"A)NoMG wr={g0*100/T:.1f}% net={a:+.0f}x ev={a/T:+.4f}")
b=g0*P*1+g1*(P*M1-1)-(g2w+g2l)*(1+M1);print(f"B)MG1  wr={(g0+g1)*100/T:.1f}% net={b:+.0f}x ev={b/T:+.4f}")
e=g0*P+g1*(P*M1-1)+g2w*(P*M2-1-M1)-g2l*(1+M1+M2);print(f"C)MG2  wr={(g0+g1+g2w)*100/T:.1f}% net={e:+.0f}x ev={e/T:+.4f}")
json.dump({'T':T,'g0':g0,'g1':g1,'g2w':g2w,'g2l':g2l,'M1':round(M1,3),'M2':round(M2,3),'evA':round(a/T,4),'evB':round(b/T,4),'evC':round(e/T,4)},open('intelligence/gale_scenario_analysis.json','w'))
