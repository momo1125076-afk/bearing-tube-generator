#!/usr/bin/env python3
"""软弹轴承管 —— 命令行生成 + 验证（与网页同一套几何：调用 geom.js，避免两套实现不一致）
用法:
  python3 bearing_tube.py --perLayer 3 --layers 4 --alphaDeg 25 --out out_py   # 生成单元/拼接 STEP、STL（需 node + npm 依赖）
  python3 bearing_tube.py --verify out_py/default 6                             # 用 CadQuery 检查导出件（可选）
任何 geom.js 参数都可以 --参数名 值 传入（如 --nutType tap --tieSize M3 --pitchMode manual --pitch 12）。
估算：simulate() 是 physics.js 的 Python 版（按单元累加，含层距）。
"""
import json, math, os, subprocess, sys, argparse

PHYS = dict(m_g=1.0, v0=55, dartD=13, dartL=38, kI=0.4, depth=0.66, alphaDeg=25, perLayer=3, layers=2, pitch=11.6,
            flangeR=3.6, bearingRi=1.5, mb_g=0.4, kn=5, mu=0.5, crr=0.05, bearingDrag=0.0)

def simulate(p0):
    p = dict(PHYS); p.update(p0)
    m = p['m_g']/1000; R = p['dartD']/2000; rc = R - p['depth']/1000; a = math.radians(p['alphaDeg'])
    I = p['kI']*m*R*R; Rf = p['flangeR']/1000; Ib = 0.5*p['mb_g']/1000*(0.003**2 + (p['bearingRi']/1000)**2)
    Nf = p['kn']*p['depth']; Lc = 2*math.sqrt(max(2*p['flangeR']*p['depth'] - p['depth']**2, 0))
    Lint = (p['dartL'] + Lc)/1000; pitch = p['pitch']/1000; nL = int(p['layers']); n = int(p['perLayer'])
    ca, sa = math.cos(a), math.sin(a); dt = 2e-7; v = p['v0']; w = 0.0; x = 0.0; wb = [0.0]*nL
    while x < (nL-1)*pitch + Lint and v > 0.5:
        dv = dw = 0.0
        for L in range(nL):
            xr = x - L*pitch
            if xr < 0 or xr > Lint: continue
            sy = v - wb[L]*Rf*ca; st = w*rc - wb[L]*Rf*sa; sm = math.hypot(sy, st); f = p['mu']*Nf/(sm + 0.05)
            Fy, Ft = -f*sy, -f*st; tb = -(Fy*ca + Ft*sa)*Rf - p['bearingDrag']/1000*(1 if wb[L] > 0 else 0)
            dv += n*(Fy - p['crr']*Nf)/m*dt; dw += n*Ft*rc/I*dt; wb[L] += tb/Ib*dt
        v += dv; w += dw; x += v*dt
    wi = p['v0']*math.tan(a)/rc
    return dict(v_out=v, dV=p['v0']-v, rpm=w*30/math.pi, rpm_ideal=wi*30/math.pi, spin_eff=w/wi)

def verify(prefix, nb):
    import cadquery as cq
    a = cq.importers.importStep(prefix + '_assembly.step').solids().vals(); un, br = a[:-nb], a[-nb:]
    inter = sum(b.intersect(u).Volume() for b in br for u in un)
    print('单元', len(un), '件, 体积', round(sum(u.Volume() for u in un), 1), 'mm3; 轴承∩单元 =', round(inter, 4), 'mm3; 全部有效', all(u.isValid() for u in un))

if __name__ == '__main__':
    if '--verify' in sys.argv:
        i = sys.argv.index('--verify'); verify(sys.argv[i+1], int(sys.argv[i+2])); sys.exit()
    ap = argparse.ArgumentParser(); ap.add_argument('--out', default='out_py'); ap.add_argument('--tag', default='default')
    args, rest = ap.parse_known_args()
    case = {'tag': args.tag}
    for k, v in zip(rest[::2], rest[1::2]):
        k = k.lstrip('-')
        try: case[k] = float(v)
        except ValueError: case[k] = v
    here = os.path.dirname(os.path.abspath(__file__)); os.makedirs(os.path.join(here, 'out'), exist_ok=True)
    r = subprocess.run(['node', 'test_node.mjs', json.dumps([case])], cwd=here, capture_output=True, text=True)
    line = [l for l in r.stdout.splitlines() if l.startswith('{')]
    if not line: print(r.stdout[-2000:], r.stderr[-2000:]); sys.exit(1)
    res = json.loads(line[-1]); print(json.dumps({k: res[k] for k in ('pitch', 'len', 'stackLen', 'baseVol', 'unitVol', 'nUnits', 'inter', 'screw', 'tie')}, ensure_ascii=False))
    print('干涉检查:', '通过' if res['chk']['ok'] else res['chk']['warnings'])
    print('估算:', simulate({**case, 'pitch': res['pitch']}))
    os.makedirs(args.out, exist_ok=True)
    for suf in ('unit.step', 'unit.stl', 'base.step', 'base.stl', 'body.step', 'body.stl', 'assembly.step'):
        if os.path.exists(os.path.join(here, 'out', f'{args.tag}_{suf}')): os.replace(os.path.join(here, 'out', f'{args.tag}_{suf}'), os.path.join(args.out, f'{args.tag}_{suf}'))
    print('->', args.out)
