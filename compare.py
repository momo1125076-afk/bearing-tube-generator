# 对比：工具导出的装配 STEP 中第 1 层 3 个轴承 vs 原 STEP（orig.step）中一个模块的 3 个轴承（y≈75–82）
import cadquery as cq, numpy as np, math, sys
fn = sys.argv[1] if len(sys.argv) > 1 else 'out_html/default_asmStep.step'; nb = int(sys.argv[2]) if len(sys.argv) > 2 else 6
orig = [s for s in cq.importers.importStep('orig.step').solids().vals()[:6] if s.BoundingBox().ymax < 100]
mine = cq.importers.importStep(fn).solids().vals()[-nb:][:3]
def axis(s):
    for f in s.Faces():
        if f.geomType() == 'CYLINDER' and abs(f._geomAdaptor().Cylinder().Radius() - 3.6) < 1e-3:
            d = f._geomAdaptor().Cylinder().Axis().Direction(); u = np.array([d.X(), d.Y(), d.Z()]); fl = np.array(f.Center().toTuple())
            c = np.array(s.Center().toTuple()); return c, u * np.sign(np.dot(fl - c, u))
oc = [axis(s) for s in orig]; mc = [axis(s) for s in mine]
dy = np.mean([c[1] for c, _ in oc]) - np.mean([c[1] for c, _ in mc])
for c, u in oc:
    i = min(range(3), key=lambda i: np.linalg.norm(mc[i][0] + [0, dy, 0] - c)); m, mu = mc[i]
    print('轴承 中心误差 %.4f mm  轴线夹角 %.3f°  法兰同侧 %s' % (np.linalg.norm(m + [0, dy, 0] - c), math.degrees(math.acos(min(1, abs(np.dot(mu, u))))), np.dot(mu, u) > 0))
print('Y 平移 %.3f mm（只差整体沿管轴平移）' % dy)
