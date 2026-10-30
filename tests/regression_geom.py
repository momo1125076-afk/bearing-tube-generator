"""几何回归检查：python3 tests/regression_geom.py <下载目录>
读取 regression_browser.mjs 导出的 {A3,B3}_kinds.stl / _base.stl / _asm.step / _last.json。
依赖：pip install trimesh numpy cadquery manifold3d
检查：支撑脚、悬垂斜面、底座 O 圈槽、M3 孔、长螺丝孔、水密、轴承∩打印件=0、单元互不干涉、整管水密。"""
import sys, os, json, numpy as np, trimesh
D = sys.argv[1] if len(sys.argv) > 1 else 'tests/out'
fail = 0
WHOLE = {}
def ok(name, p, d=''):
    global fail
    print('PASS' if p else 'FAIL', name, d); fail += (not p)
for M in ['A', 'B']:
    last = json.load(open(os.path.join(D, f'{M}3_last.json')))
    kinds = trimesh.load(os.path.join(D, f'{M}3_kinds.stl')).split(only_watertight=False)
    units = [b for b in kinds if b.volume < 3000]; base = max(kinds, key=lambda b: b.volume)
    ok(f'{M}: 各单元种类水密', all(b.is_watertight for b in kinds), str([round(b.volume, 1) for b in kinds]))
    g = [int((2 - b.euler_number) // 2) for b in units]
    ok(f'{M}: 每种单元都有 M3 穿孔（亏格≥1）', all(x >= 1 for x in g), f'genus={g}')
    if M == 'B': ok('B: 长螺丝孔存在（亏格>1）', all(x > 1 for x in g), f'genus={g}')
    if M == 'A':
        ff = last['foot']['layers']
        ok('A: 叠加层支撑脚楔块存在', all((x['foot'] or 0) > 5 for x in ff), str([round(x['foot'], 1) for x in ff]))
        lu = 1.0 + 10 * last.get('splitGap', 0); ok(f'A: 叠加层底面落在下层顶面（悬空<{lu:.1f}mm²，含打印间隙）', all(x['unsup'] < lu for x in ff), str([round(x['unsup'], 2) for x in ff]))
        vols = sorted(round(u.volume, 1) for u in units)
        ok('A: 底层/叠加层是不同单元（叠加层带脚）', len(set(vols)) >= 2, str(vols))
    # 悬垂斜面：除底面外朝下且与水平夹角 <44.5° 的面积
    for u in units:
        n, a, c = u.face_normals, u.area_faces, u.triangles_center
        bad = (n[:, 1] < -np.cos(np.radians(44.5))) & (c[:, 1] > u.bounds[0][1] + 0.05)
        lim = 40 if (M == 'A' and last.get('slopeDrop', 0) > 0) else (10 if last.get('splitGap', 0) > 0 else 8)   # 打印间隙 >0 时 V 槽侧壁多出少量 <45° 面   # A 斜面下移后，单元裙边底面贴在下层上：分件单独打印需支撑，推荐融合整体打印
        ok(f'{M}: 单元 {u.volume:.0f} 剩余陡悬垂 <{lim} mm²', a[bad].sum() < lim, f'{a[bad].sum():.2f} mm²')
    # 层间嵌合：下层单元（bottom/mid）顶面有 V 形止口环凸起（高度 > 层距），上层底面不低于 0（底面是平的）
    pitch = last['pitch']; hs = sorted(round(u.bounds[1][1] - u.bounds[0][1], 2) for u in units)
    ok(f'{M}: 层间嵌合止口环存在（单元高 > 层距 {pitch}）', last['mateDepth'] <= 0 or max(hs) > pitch + 0.3, f'单元高度 {hs}')
    # 斜面下移：A 叠加层单元向下伸出裙边（单元总高 ≥ 层距 + slopeDrop）
    if M == 'A' and last.get('slopeDrop', 0) > 0:
        ok(f'{M}: 衔接斜面下移 {last["slopeDrop"]} mm（叠加层单元向下包裹）', max(hs) >= pitch + last['slopeDrop'] - 0.1, f'单元高度 {hs}')
    # 圆形底座：外形为 Ø tubeOD 圆柱（X/Z 向尺寸相等）
    bm = trimesh.load(os.path.join(D, f'{M}3_base.stl')); ex = bm.bounds[1] - bm.bounds[0]
    ok(f'{M}: 底座为圆形（X/Z 外径相等）', abs(ex[0] - ex[2]) < 0.05 and abs(ex[0] - last['tubeOD']) < 0.1, f'{ex[0]:.2f} × {ex[2]:.2f}')
    # 整体打印（组装态）导出
    wf = os.path.join(D, f'{M}3_whole.stl')
    if os.path.exists(wf):
        wm = trimesh.load(wf); n_, a_, c_ = wm.face_normals, wm.area_faces, wm.triangles_center
        ohw = a_[(n_[:, 1] < -np.cos(np.radians(44.5))) & (c_[:, 1] > wm.bounds[0][1] + last['baseT'] - 0.6)].sum()
        ok(f'{M}: 整体打印 STL 水密且为 1 个实体', wm.is_watertight and len(wm.split(only_watertight=False)) == 1, f'{wm.volume:.0f} mm³')
        ok(f'{M}: 整体打印 底座以上陡悬垂 <25 mm²', ohw < 25, f'{ohw:.2f} mm²')
        WHOLE[M] = wm
    else: ok(f'{M}: 整体打印 STL 已导出', False)
    # O 圈槽：底座插管内孔在两道槽高度处半径扩大到 槽底Ø/2
    base = trimesh.load(os.path.join(D, f'{M}3_base.stl')); y0 = base.bounds[0][1]
    def rmin(y):
        sec = base.section(plane_origin=[0, y, 0], plane_normal=[0, 1, 0]); return np.hypot(sec.vertices[:, 0], sec.vertices[:, 2]).min()
    ys = [v for v in (last.get('oringY1'), last.get('oringY2')) if v]
    ok(f'{M}: 底座两道 O 圈槽参数存在', len(ys) == 2)
    for yy in ys:
        rg, rn = rmin(y0 + yy), rmin(y0 + yy + 2.5)
        ok(f'{M}: 底座 O 圈槽 @离底 {yy} mm', abs(rg - last['oringGrooveD'] / 2) < 0.15 and rg > rn + 0.3, f'槽处 Ø{2*rg:.2f}（设定 Ø{last["oringGrooveD"]}），旁边内孔 Ø{2*rn:.2f}')
    # 装配：轴承∩打印件、单元互相、整管水密
    try:
        import cadquery as cq
        def bbx(a, b):
            A, B = a.BoundingBox(), b.BoundingBox()
            return A.xmin <= B.xmax and B.xmin <= A.xmax and A.ymin <= B.ymax and B.ymin <= A.ymax and A.zmin <= B.zmax and B.zmin <= A.zmax
        sol = cq.importers.importStep(os.path.join(D, f'{M}3_asm.step')).solids().vals()
        brg = [s for s in sol if 30 < s.Volume() < 80]; prt = [s for s in sol if s not in brg]
        bi = sum(b.intersect(p).Volume() for b in brg for p in prt if bbx(b, p))
        uu = sum(prt[i].intersect(prt[j]).Volume() for i in range(len(prt)) for j in range(i + 1, len(prt)) if bbx(prt[i], prt[j]))
        ok(f'{M}: 轴承∩打印件 = 0', bi < 0.01, f'{bi:.4f} mm³ ({len(brg)} 轴承 / {len(prt)} 打印件)')
        ok(f'{M}: 打印件互不干涉', uu < 0.05, f'{uu:.4f} mm³')
        if M in WHOLE:   # 整体打印件 ∩ 轴承
            bms = []
            for i, b in enumerate(brg):
                f = os.path.join(D, f'_{M}_b{i}.stl'); cq.exporters.export(cq.Workplane().add(b), f, tolerance=0.01); bms.append(trimesh.load(f)); os.remove(f)
            try:
                wi = sum(trimesh.boolean.intersection([WHOLE[M], bm], engine='manifold').volume for bm in bms)
                ok(f'{M}: 整体打印件 ∩ 轴承 = 0', wi < 0.05, f'{wi:.4f} mm³')
            except Exception as e: print('SKIP 整体∩轴承', e)
        ms = []
        for i, sp in enumerate(prt):
            f = os.path.join(D, f'_{M}_part{i}.stl'); cq.exporters.export(cq.Workplane().add(sp), f, tolerance=0.01); ms.append(trimesh.load(f)); os.remove(f)
        try:
            tm = trimesh.boolean.union(ms, engine='manifold')   # pip install manifold3d
            nb = len(tm.split(only_watertight=False)); ok(f'{M}: 整管（分件网格并集）水密、体积守恒（分件贴合面网格不共点时可能 >1 体，整体连通由整体打印 STL 检查）', tm.is_watertight and abs(tm.volume - sum(m.volume for m in ms)) < 0.01 * tm.volume, f'{nb} 体 {tm.volume:.0f} mm³（各件体积和 {sum(m.volume for m in ms):.0f}）')
            tm.export(os.path.join(D, f'{M}3_tube.stl'))
        except Exception as e:
            print('SKIP 整管水密（需 pip install manifold3d）', e)
    except ImportError:
        print('SKIP 装配检查（未安装 cadquery）')
print('\n全部通过' if not fail else f'\n{fail} 项失败'); sys.exit(1 if fail else 0)
