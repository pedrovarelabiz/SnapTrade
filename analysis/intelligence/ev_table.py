P=0.88;M1=(1+P)/P;M2=(1+M1+P)/P
r=[]
# SM
a=4072;b=2009;c=1137;T=a+b+c
r.append(('SM','NoMG',a/T*100,(a*P-(b+c))/T))
r.append(('SM','MG1',(a+b)/T*100,(a*P+b*(P*M1-1)-c*(1+M1))/T))
# BL
a=402;b=139;c=343;T=a+b+c
r.append(('BL','NoMG',a/T*100,(a*P-(b+c))/T))
r.append(('BL','MG1',(a+b)/T*100,(a*P+b*(P*M1-1)-c*(1+M1))/T))
# VIP
a=3958;b=2008;c=1002;d=1021;T=a+b+c+d
r.append(('VIP','NoMG',a/T*100,(a*P-(T-a))/T))
r.append(('VIP','MG1',(a+b)/T*100,(a*P+b*(P*M1-1)-(c+d)*(1+M1))/T))
r.append(('VIP','MG2',(a+b+c)/T*100,(a*P+b*(P*M1-1)+c*(P*M2-1-M1)-d*(1+M1+M2))/T))
# TT
a=2546;b=1469;c=418;d=670;T=a+b+c+d
r.append(('TT','NoMG',a/T*100,(a*P-(T-a))/T))
r.append(('TT','MG1',(a+b)/T*100,(a*P+b*(P*M1-1)-(c+d)*(1+M1))/T))
r.append(('TT','MG2',(a+b+c)/T*100,(a*P+b*(P*M1-1)+c*(P*M2-1-M1)-d*(1+M1+M2))/T))
# PT
r.append(('PT','as-is',87.4,0.874*P-0.126))
for n,m,wr,ev in r:
    print(f"{n:4s} {m:>5s} WR={wr:5.1f}% EV={ev:+.4f} {'YES' if ev>0 else 'NO'}")
