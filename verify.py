# 用 CadQuery + trimesh 检查网页导出件：python3 verify.py <tag> <轴承数>
import cadquery as cq, sys, trimesh, itertools
d='out_html'; tag=sys.argv[1]; nb=int(sys.argv[2])
for k in ['baseStl','unitStl','kindsStl','bodyStl']:
    m=trimesh.load(f'{d}/{tag}_{k}.stl'); parts=m.split(only_watertight=False)
    print(f'{k}: 三角形 {len(m.faces)}, 水密 {m.is_watertight}, 体积 {m.volume:.1f} mm3, 实体 {len(parts)} 个')
b=cq.importers.importStep(f'{d}/{tag}_baseStep.step').solids().vals()[0]; bb=b.BoundingBox()
print(f'底座 STEP: 体积 {b.Volume():.1f}, 有效 {b.isValid()}, Ø{bb.xlen:.2f} × 厚 {bb.ylen:.2f} (Y {bb.ymin:.2f}..{bb.ymax:.2f})')
a=cq.importers.importStep(f'{d}/{tag}_asmStep.step').solids().vals(); parts, br = a[:-nb], a[-nb:]
base=[s for s in parts if s.BoundingBox().ymax<=1e-6][0]; un=[s for s in parts if s is not base]
ib=sum(x.intersect(base).Volume() for x in br); iu=sum(x.intersect(u).Volume() for x in br for u in un)
pp=sum(p.intersect(q).Volume() for p,q in itertools.combinations(parts,2))
touch=sum(1 for u in un if abs(u.BoundingBox().ymin)<1e-3)
L=max(s.BoundingBox().ymax for s in parts)-min(s.BoundingBox().ymin for s in parts)
print(f'装配: 底座1 + 单元 {len(un)} + 轴承 {len(br)}; 总长 {L:.2f}; 轴承∩底座 {ib:.4f}, 轴承∩单元 {iu:.4f}, 打印件两两交集 {pp:.4f} mm3; 贴在底座顶面的单元 {touch}')
body=cq.importers.importStep(f'{d}/{tag}_bodyStep.step').solids().vals()
print(f'整管 STEP: {len(body)} 件, 总体积 {sum(s.Volume() for s in body):.1f}, 全部有效 {all(s.isValid() for s in body)}')
# 长螺丝孔对齐：底座孔轴线 vs 单元孔轴线（取 Y 向 r<1.2 的圆柱面）
def holes(s):
    r=set()
    for f in s.Faces():
        if f.geomType()=='CYLINDER':
            c=f._geomAdaptor().Cylinder(); ax=c.Axis()
            if abs(ax.Direction().Y())>0.999 and 0.85<c.Radius()<1.2: r.add((round(ax.Location().X(),3),round(ax.Location().Z(),3)))
    return r
hb=holes(base); hu=set().union(*[holes(u) for u in un]); print('底座长螺丝孔', sorted(hb), '与单元孔轴线一致:', hb<=hu)
