// 参数化轴承管几何（replicad / OpenCascade WASM）。坐标：Y = 管轴线，单位 mm。
// 结构（对齐原 STEP 的「单元」）：每层轴承 = 一个 Ø27 圆柱单元（中心通孔），单元沿 Y 紧邻叠放，
// 由 N 根轴向长螺丝（拉杆）贯穿全部单元补强；每个轴承用 M3 螺丝作销轴（弦向穿过单元壁，螺帽沉孔 + 螺母槽/自攻孔）。
export const GEOM_DEFAULTS = {
  dartD: 13, depth: 0.66, alphaDeg: 25, perLayer: 3, layers: 2,
  pitchMode: 'auto', pitch: 13.7, staggerMode: 'none', staggerDeg: 0, phaseDeg: -0.33, axialShift: -0.906,
  tubeOD: 27, boreClear: 0.25, endPad: 0.3, pocketClear: 0.3, minWall: 0.8,
  bossD: 4.2, bossH: 0.4,                       // 支撑凸台：只顶住轴承内圈，外圈自由转动
  // M3 销轴螺丝
  screwClear: 3.3, headType: 'socket', headD: 5.8, headH: 3.2, headWall: 2.2, nutType: 'hex', nutAF: 5.6, nutT: 2.6, nutWall: 1.2, tapD: 2.5, pinHoleD: 2.95, screwSide: 1,
  // 长螺丝（拉杆）
  tieCount: 1, tieSize: 'M2', tieR: 10.26, tieAuto: 1, tieOffsetDeg: 55, tieEnd: 'tap', splitOffsetDeg: 11,
  // 底座（对齐原 STEP solid 15 的 2.4 mm 底板：Ø27、中心孔 Ø15、3×Ø1.9 长螺丝自攻孔 @R10.26）
  baseOn: 1, baseT: 2.4, baseBoreD: 15, baseTie: 'tap',
  bRo: 3.0, bRi: 1.5, bW: 2.5, fR: 3.6, fT: 0.6
};
export const TIE_SPECS = { M2: { clear: 2.2, tap: 1.8, headD: 4.0, headH: 2.0, nutAF: 4.1, nutT: 1.6 }, M3: { clear: 3.3, tap: 2.5, headD: 5.8, headH: 3.2, nutAF: 5.6, nutT: 2.6 } };
export const STD_LEN = [4, 5, 6, 8, 10, 12, 14, 16, 18, 20, 22, 25, 28, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 90, 100];
const f2 = x => (+x).toFixed(2);
const rad = d => d * Math.PI / 180;
export function centerRadius(p) { return p.dartD / 2 - p.depth + p.fR; }
export function pocketW(p) { return p.bW + 2 * (p.pocketClear + p.bossH); }
export function effStagger(p) {
  if (p.staggerMode === 'none') return 0;
  if (p.staggerMode === 'half') return 180 / p.perLayer;
    return p.staggerDeg;
}
export function layerTheta(p, L, k) { return p.phaseDeg + L * effStagger(p) + k * 360 / p.perLayer; }
// 单元：每层 = N 个相同的扇形单元（每个单元含 1 个轴承），单元高 = 层距 H，层 L 占 Y∈[L·H,(L+1)·H]
export function unitY0(p) { const ext = p._ext || { lo: 7, hi: 7 }; return ext.lo + (p.pitch - ext.lo - ext.hi) / 2; } // 层点在单元内居中
export function layerY(p, L) { return L * p.pitch + unitY0(p); }
export function tubeLength(p) { return p.layers * p.pitch; }              // 单元堆叠长度（不含底座）
export const hasBase = p => +p.baseOn > 0 && p.baseT > 0;
export function baseY(p) { return hasBase(p) ? -p.baseT : 0; }           // 底座底面 Y（单元从 Y=0 开始）
export function totalLength(p) { return tubeLength(p) - baseY(p); }      // 整管总长 = 底座 + N 层单元
const tipAtBase = p => hasBase(p) && p.baseTie === 'tap';                // 长螺丝从顶层穿入、拧进底座自攻孔（原模型做法）
export function unitSpan(p) { return 360 / p.perLayer; }
export function frames(p) {
  const Rc = centerRadius(p), a = rad(p.alphaDeg), out = [];
  for (let L = 0; L < p.layers; L++) for (let k = 0; k < p.perLayer; k++) {
    const th = rad(layerTheta(p, L, k));
    const rot = ([x, y, z]) => [x * Math.cos(th) + z * Math.sin(th), y, -x * Math.sin(th) + z * Math.cos(th)];
    out.push({ layer: L, k, thetaDeg: layerTheta(p, L, k),
      c: rot([Rc, layerY(p, L) + p.axialShift * -Math.sin(a), p.axialShift * -Math.cos(a)]), u: rot([0, -Math.sin(a), -Math.cos(a)]) });
  }
  return out;
}
function placeAt(shape, p, y, thDeg) {
  return shape.translate([0, 0, -p.axialShift]).rotate(-p.alphaDeg, [0, 0, 0], [1, 0, 0]).translate([centerRadius(p), y, 0]).rotate(thDeg, [0, 0, 0], [0, 1, 0]);
}
const place = (shape, p, L, th) => placeAt(shape, p, layerY(p, L), th);
// 局部坐标：轴承轴线 Z，轴承几何中点在原点，法兰在 -Z 端
function bearingLocal(R, p) {
  const h = p.bW / 2;
  return R.makeCylinder(p.bRo, p.bW, [0, 0, -h], [0, 0, 1]).fuse(R.makeCylinder(p.fR, p.fT, [0, 0, -h], [0, 0, 1]))
    .cut(R.makeCylinder(p.bRi, p.bW + 2, [0, 0, -h - 1], [0, 0, 1]));
}
const cylZ = (R, r, z0, z1) => R.makeCylinder(r, z1 - z0, [0, 0, z0], [0, 0, 1]);
// 沿轴线 s 处到管轴的距离 = Ro 时的 s（局部 Z），用于孔深/螺丝长度
export function sOut(p, sign) {
  const a = rad(p.alphaDeg), Rc = centerRadius(p), Ro = p.tubeOD / 2;
  // 局部点 (0,0,s) → 绕X转 -α 后 (0, s·sinα?, s·cosα)，径向距离 = sqrt(Rc² + (s'·cosα)²)，s' = s - axialShift
  // 解 sqrt(Rc² + ((s-ax)cosα)²) = Ro
  const t = Math.sqrt(Math.max(Ro * Ro - Rc * Rc, 0)) / Math.cos(a);
  return sign > 0 ? t + p.axialShift : -t + p.axialShift;
}
// 每个轴承的切削体（局部）：避让腔（减去两侧支撑凸台）+ 外侧装入槽 + M3 孔（通孔/沉孔/螺母槽或自攻孔）
// extra>0：干涉检查用外扩
function screwParts(R, p, extra = 0, ess = false) {   // ess=true：只取螺丝/螺帽/螺母实际占用的空间（不含装入通道），用于求单元高度
  const W = pocketW(p), sg = p.screwSide >= 0 ? 1 : -1, S = 25, e = extra;
  const hs = W / 2 + p.headWall, ns = W / 2 + p.nutWall;       // 螺帽承压面 / 螺母承压面 到轴承中点的距离
  const seg = (r, a0, a1) => { const lo = Math.min(sg * a0, sg * a1), hi = Math.max(sg * a0, sg * a1); return cylZ(R, r + e, lo, hi); };
  if (p.nutType === 'pin') return seg(p.pinHoleD / 2, ess ? -hs : -S, ess ? ns : S);   // Ø3 钢销（压入/胶固），无螺帽螺母，最紧凑
  let s = seg(p.screwClear / 2, -hs, p.nutType === 'tap' ? W / 2 : ns);          // 通孔（螺帽侧→腔→螺母侧壁）
  s = s.fuse(seg(p.headD / 2, -hs, ess ? -(hs + p.headH + 0.3) : -S));                                          // 螺帽沉孔（开到外表面）
  const tip = screwTip(p);
  if (p.nutType === 'tap') s = s.fuse(seg(p.tapD / 2, W / 2 - 0.01, ess ? tip + 0.5 : S));          // Ø2.5 自攻孔
  else {
    const zE = ess ? ns + p.nutT + 0.3 : S, rr = p.nutAF / Math.sqrt(3) + e, z0 = sg > 0 ? ns : -zE, z1 = sg > 0 ? zE : -ns;
    s = s.fuse(R.drawPolysides(rr, 6).sketchOnPlane('XY', z0).extrude(z1 - z0).rotate(30, [0, 0, 0], [0, 0, 1]));  // 六角螺母槽（开到外表面）
    s = s.fuse(seg(p.screwClear / 2, ns, ess ? Math.max(tip + 0.5, ns + 0.1) : S));
  }
  return s;
}
function screwTip(p) { const si = screwInfo(p); return si.L - si.headSeat; }   // 螺丝尖端（局部 s）
function cutterLocal(R, p, extra = 0, ess = false) {
  const W = pocketW(p), c = p.pocketClear + extra, r = p.fR + c, Wc = W + 2 * extra;
  let pocket = cylZ(R, r, -Wc / 2, Wc / 2).fuse(R.makeBox([0, -r, -Wc / 2], [p.tubeOD, r, Wc / 2]));
  if (extra === 0 && p.bossH > 0) for (const sg of [1, -1]) {
    const z = sg * W / 2; pocket = pocket.cut(cylZ(R, p.bossD / 2, Math.min(z, z - sg * p.bossH), Math.max(z, z - sg * p.bossH)));
  }
  return pocket.fuse(screwParts(R, p, extra, ess));
}
const vol = (R, s) => { try { return R.measureVolume ? R.measureVolume(s) : R.measureShapeVolumeProperties(s).volume; } catch (e) { return 0; } };
function fuseAll(arr) { let s = arr[0]; for (let i = 1; i < arr.length; i++) s = s.fuse(arr[i]); return s; }
function layerCutters(R, p, local, y, L) { const r = []; for (let k = 0; k < p.perLayer; k++) r.push(placeAt(local.clone(), p, y, layerTheta(p, L, k))); return fuseAll(r); }
// 单层切削体（不含外扩）在 Y 方向相对层点的范围，限制在管外径内
function measureExtent(R, p) {
  const c = layerCutters(R, p, cutterLocal(R, p, 0, true), 0, 0).intersect(R.makeCylinder(p.tubeOD / 2, 200, [0, -100, 0], [0, 1, 0]));
  const bb = c.boundingBox.bounds; return { lo: -bb[0][1], hi: bb[1][1] };
}
// 相邻两层（外扩 minWall/2 后）交集体积 → 用于求最小层距
function layerPairVol(R, p, pitch, envCache) {
  const env = envCache || cutterLocal(R, p, p.minWall / 2, true), clip = R.makeCylinder(p.tubeOD / 2 + 3, 400, [0, -200, 0], [0, 1, 0]);
  const a = layerCutters(R, p, env, 0, 0).intersect(clip), b = layerCutters(R, p, env, pitch, 1).intersect(clip);
  return vol(R, a.intersect(b));
}
export function minPitch(R, p) {
  const env = cutterLocal(R, p, p.minWall / 2, true);
  let lo = 2, hi = 40; if (layerPairVol(R, p, hi, env) > 1e-3) return hi;
  for (let i = 0; i < 9; i++) { const m = (lo + hi) / 2; if (layerPairVol(R, p, m, env) > 1e-3) lo = m; else hi = m; }
  return Math.ceil(hi * 10) / 10;
}
// 解析全部自动参数：错角(最紧)、层距(紧邻)、端部范围
// 解析自动参数：单元自洽层距（本单元的腔/孔不伸进相邻单元）+ 参考：交错嵌套时的最小层距（不错开 / 错开半角）
export function resolve(R, p0) {
  const p = { ...p0 }; p._ext = measureExtent(R, p);
  p._unitPitch = Math.ceil((p._ext.lo + p._ext.hi + 2 * p.endPad) * 10) / 10;
  if (p.pitchMode === 'auto') p.pitch = p._unitPitch;
  if (p.tieAuto && p.tieCount > 0 && p.perLayer > 1) {   // 自动找长螺丝角度：在扇形内找不碰腔/孔、不越拼接面的位置，取离首选角最近者
    const pref = p.perLayer === 3 ? p.tieOffsetDeg : p.splitOffsetDeg + unitSpan(p) * (55 - 11) / 120, h = unitSpan(p) / 2;
    const cand = []; for (let a = p.splitOffsetDeg - h; a <= p.splitOffsetDeg + h; a += 1.5) cand.push(a);
    cand.sort((x, y) => Math.abs(x - pref) - Math.abs(y - pref));
    p._tieFound = false;
    for (const a of cand) { const r = tieClash(R, { ...p, tieOffsetDeg: a }); if (r.tv + r.tw < 1e-3) { p.tieOffsetDeg = a; p._tieFound = true; break; } }
  }
  if (p.withCompare && p.layers > 1) {
    p._cmp = {};
    for (const [mode, st] of [['none', 0], ['half', 180 / p.perLayer]]) p._cmp[mode] = { stagger: st, pitch: minPitch(R, { ...p, staggerMode: 'custom', staggerDeg: st }) };
  }
  return p;
}
function tieThetas(p) { const r = []; if (p.tieCount > 0) for (let k = 0; k < p.perLayer; k++) r.push(p.phaseDeg + p.tieOffsetDeg + k * 360 / p.perLayer); return r; }  // 每个单元 1 根
function tieCutters(R, p, extra = 0) {
  const T = TIE_SPECS[p.tieSize], len = tubeLength(p), topY = (p.layers - 1) * p.pitch, yB = baseY(p), out = [];
  for (const th of tieThetas(p)) {
    const x = p.tieR * Math.cos(rad(th)), z = -p.tieR * Math.sin(rad(th));
    const at = (r, y0, y1) => R.makeCylinder(r + extra, y1 - y0, [x, y0, z], [0, 1, 0]);
    let s;
    if (tipAtBase(p)) {                                                            // 顶层螺帽沉孔 → 各层通孔 → 底座自攻孔（螺丝尖端不超出底面）
      const cb = tieInfo(p).cbDepth;
      s = at(T.tap / 2, yB - 1, 0.01).fuse(at(T.clear / 2, 0, len + 1)).fuse(at(T.headD / 2 + 0.2, len - cb, len + 1));
    } else {
      s = at(T.headD / 2 + 0.2, yB - 1, yB + T.headH);                             // 最底面螺帽沉孔（有底座时在底座上）
      s = s.fuse(at(T.clear / 2, yB - 1, p.tieEnd === 'tap' ? (p.layers > 1 ? topY + 0.01 : len + 1) : len + 1));
      if (p.tieEnd === 'tap' && p.layers > 1) s = s.fuse(at(T.tap / 2, topY, len - 1));
      if (p.tieEnd === 'nut') s = s.fuse(R.drawPolysides(T.nutAF / Math.sqrt(3) + 0.1 + extra, 6).sketchOnPlane('XZ').extrude(T.nutT + 0.3).translate([x, len + 0.01, z]));
    }
    out.push(s);
  }
  return out;
}
// ★ 底座：Ø外径 × baseT 圆盘，中心孔 baseBoreD，长螺丝孔（自攻孔或螺帽沉孔）与单元同角度、同半径；位于 Y∈[−baseT,0]，顶面与第 1 层单元底面贴合
export function buildBase(R, p) {
  let b = R.makeCylinder(p.tubeOD / 2, p.baseT, [0, -p.baseT, 0], [0, 1, 0]).cut(R.makeCylinder(p.baseBoreD / 2, p.baseT + 2, [0, -p.baseT - 1, 0], [0, 1, 0]));
  for (const t of tieCutters(R, p)) b = b.cut(t);
  return b;
}
// 扇形楔体（θ 空间 [a0,a1]，点坐标 x=R cosθ, z=−R sinθ），Y∈[y0,y1]
function wedge(R, a0, a1, y0, y1, Rr) {
  const n = 24; let d = R.draw([0, 0]);
  for (let i = 0; i <= n; i++) { const t = rad(a0 + (a1 - a0) * i / n); d = d.lineTo([Rr * Math.cos(t), -Rr * Math.sin(t)]); }
  return d.close().sketchOnPlane('XZ').extrude(y1 - y0).translate([0, y1, 0]);
}
export function buildBearings(R, p) { const b = bearingLocal(R, p), r = []; for (let L = 0; L < p.layers; L++) for (let k = 0; k < p.perLayer; k++) r.push(place(b.clone(), p, L, layerTheta(p, L, k))); return r; }
// 第 L 层的整圈（N 个轴承切削体都减掉）——单元在它上面切出，保证单元拼接面两侧孔位一致
function layerRing(R, p, L, withTies = true) {
  const y0 = L * p.pitch, H = p.pitch;
  let ring = R.makeCylinder(p.tubeOD / 2, H, [0, y0, 0], [0, 1, 0]).cut(R.makeCylinder(p.dartD / 2 + p.boreClear, H + 2, [0, y0 - 1, 0], [0, 1, 0]));
  ring = ring.cut(layerCutters(R, p, cutterLocal(R, p, 0), layerY(p, L), L));
  if (withTies) for (const t of tieCutters(R, p)) ring = ring.cut(t);
  return ring;
}
export function sectorRange(p, L, k) { const c = layerTheta(p, L, k) + p.splitOffsetDeg, h = unitSpan(p) / 2; return [c - h, c + h]; }
// ★ 单个单元（第 L 层第 k 个）：扇形 ∩ 整圈（已减中心通道、长螺丝孔）− 本轴承完整切削体（腔+槽+M3 孔+装入通道）
//   − 相邻轴承的「实占」切削体（轴承/螺丝/螺帽/螺母本体，不含装入通道：装入通道在拼接面处被截断，装配前从拼接面/外圆进入）
export function buildUnit(R, p, L = 0, k = 0) {
  const y0 = L * p.pitch, H = p.pitch, yc = layerY(p, L);
  let u = R.makeCylinder(p.tubeOD / 2, H, [0, y0, 0], [0, 1, 0]).cut(R.makeCylinder(p.dartD / 2 + p.boreClear, H + 2, [0, y0 - 1, 0], [0, 1, 0]));
  for (const t of tieCutters(R, p)) u = u.cut(t);
  if (p.perLayer > 1) { const [a0, a1] = sectorRange(p, L, k); u = u.intersect(wedge(R, a0, a1, y0 - 1, y0 + H + 1, p.tubeOD)); }
  u = u.cut(placeAt(cutterLocal(R, p, 0), p, yc, layerTheta(p, L, k)));
  if (p.perLayer > 1) { const ess = cutterLocal(R, p, 0, true);
    for (const kk of new Set([(k + 1) % p.perLayer, (k + p.perLayer - 1) % p.perLayer])) if (kk !== k) u = u.cut(placeAt(ess.clone(), p, yc, layerTheta(p, L, kk))); }
  return u;
}
// ★ 拼接：把单元 (0,0) 绕管轴旋转/沿管轴平移复制成整管（错角=0 且拉杆在顶层为盲孔时，顶层单元单独生成）
export function assembleUnits(R, p) {
  const units = [], st = effStagger(p);
  const base = buildUnit(R, p, 0, 0), top = p.layers > 1 && p.tieCount > 0 ? buildUnit(R, p, p.layers - 1, 0).translate([0, -(p.layers - 1) * p.pitch, 0]) : null;
    const mid = p.layers > 2 && p.tieCount > 0 ? buildUnit(R, p, 1, 0).translate([0, -p.pitch, 0]).rotate(st, [0, 0, 0], [0, 1, 0]) : null;
  for (let L = 0; L < p.layers; L++) {
    let proto = L === 0 ? base : (L === p.layers - 1 && top ? top : (mid || base));
    if (p.tieCount === 0 || p.layers === 1) proto = base;
    for (let k = 0; k < p.perLayer; k++) units.push({ L, k, kind: L === 0 ? 'bottom' : (L === p.layers - 1 ? 'top' : 'mid'), shape: proto.clone().rotate(L * st + k * unitSpan(p), [0, 0, 0], [0, 1, 0]).translate([0, L * p.pitch, 0]) });
  }
  // 单元类型（打印件）
  const kinds = { bottom: base };
  if (top) kinds.top = top; if (mid) kinds.mid = mid;
  const baseShape = hasBase(p) ? buildBase(R, p) : null;
  if (baseShape) kinds.base = baseShape;
  return { units, kinds, base: baseShape };
}
export function buildBody(R, p) { const { units, base } = assembleUnits(R, p); return R.makeCompound([...(base ? [base] : []), ...units.map(u => u.shape)]); }
export function screwInfo(p) {
  if (p.nutType === 'pin') { const W = pocketW(p); return { pin: true, L: STD_LEN.find(l => l >= W + p.headWall + p.nutWall) , headSeat: W / 2 + p.headWall, nutSeat: W / 2 + p.nutWall, grip: W + p.headWall + p.nutWall }; }
  const W = pocketW(p), hs = W / 2 + p.headWall, ns = W / 2 + p.nutWall, sg = p.screwSide >= 0 ? 1 : -1;
  const avail = Math.abs(sOut(p, sg) - 0) ;   // 螺母侧从轴承中点到外表面的距离
  const need = p.nutType === 'tap' ? hs + W / 2 + Math.min(6, avail - W / 2) : hs + ns + p.nutT + 0.5;
  const L = p.nutType === 'tap' ? STD_LEN.filter(l => l <= hs + avail - 0.3).pop() : STD_LEN.find(l => l >= need);
  return { grip: hs + ns, need, L, avail, engage: p.nutType === 'tap' ? L - hs - W / 2 : null, headSeat: hs, nutSeat: ns };
}
export function tieInfo(p) {
  const T = TIE_SPECS[p.tieSize], len = tubeLength(p), tot = totalLength(p);
  if (tipAtBase(p)) {   // 螺帽在顶层沉孔，尖端拧进底座；沉孔加深补齐标准长度差，使尖端不超出底座底面
    const max = tot - T.headH, L = STD_LEN.filter(l => l <= max).pop();
    return { L, len, total: tot, size: p.tieSize, cbDepth: T.headH + (max - L), engage: p.baseT, mode: 'base-tap' };
  }
  const max = p.tieEnd === 'tap' ? tot - 1 - T.headH : tot - T.headH + 0.5;
  const L = p.tieEnd === 'tap' ? STD_LEN.filter(l => l <= max - 0.5).pop() : STD_LEN.find(l => l >= tot - T.headH - 0.2);
  return { L, len, total: tot, size: p.tieSize, mode: p.tieEnd };
}
export function tieClash(R, p) {
  const e2 = p.minWall / 2; let tv = 0, tw = 0;
  const ties = tieCutters(R, p, e2), c0 = layerCutters(R, p, cutterLocal(R, p, e2, true), layerY(p, 0), 0);
  const cl = p.layers > 1 ? c0.fuse(layerCutters(R, p, cutterLocal(R, p, e2, true), layerY(p, p.layers - 1), p.layers - 1)) : c0;
  for (const t of ties) tv += vol(R, t.clone().intersect(cl.clone()));
  if (p.perLayer > 1) { const [a0, a1] = sectorRange(p, 0, 0); const t0 = tieCutters(R, { ...p, layers: 1 }, e2)[0];
    tw = vol(R, t0.intersect(R.makeCylinder(p.tubeOD, p.pitch - 0.2, [0, 0.1, 0], [0, 1, 0])).cut(wedge(R, a0, a1, -1, p.pitch + 1, p.tubeOD))); }
  return { tv, tw };
}
// 干涉检查（全部含 minWall 外扩）
export function checkInterference(R, p) {
  const e2 = p.minWall / 2, env = cutterLocal(R, p, e2), warnings = [];
  const essE = cutterLocal(R, p, e2, true), full = cutterLocal(R, p, 0);
  const pairVol = n => {
    if (n < 2) return 0; const q = { ...p, perLayer: n }, [a0, a1] = sectorRange(q, 0, 0);
    const A = placeAt(full.clone(), q, 0, layerTheta(q, 0, 0)).intersect(wedge(R, a0, a1, -30, 30, p.tubeOD)).fuse(placeAt(essE.clone(), q, 0, layerTheta(q, 0, 0)));
    let v = 0; for (const kk of new Set([1, n - 1])) v += vol(R, A.clone().intersect(placeAt(essE.clone(), q, 0, layerTheta(q, 0, kk))));
    return v;
  };
  const ov = pairVol(p.perLayer);
  let nMax = 1; for (let n = 2; n <= 12; n++) { if (pairVol(n) > 1e-3) break; nMax = n; }
  if (ov > 1e-3) warnings.push(`每层 ${p.perLayer} 个：同层相邻轴承腔/M3 孔重叠 ${ov.toFixed(2)} mm³（含壁厚 ${p.minWall}），最大可行 ${nMax} 个`);
  const lv = p._ext.lo + p._ext.hi - p.pitch;
  if (p.layers > 1 && p.pitch < p._unitPitch - 1e-6) warnings.push(`层距 ${p.pitch} mm 小于单元自洽最小值 ${p._unitPitch} mm：本层的腔/螺帽沉孔/螺母槽会伸进相邻单元（实体干涉）`);
  // 拉杆孔 vs 所有轴承切削体
  const { tv, tw } = p.tieCount > 0 ? tieClash(R, p) : { tv: 0, tw: 0 };
  if (tv > 1e-3) warnings.push(`长螺丝孔与轴承腔/M3 孔壁厚不足（重叠 ${tv.toFixed(2)} mm³）：调「长螺丝角度偏移」「半径」或改 M2`);
  if (tw > 1e-3) warnings.push(`长螺丝孔（含壁厚）越过单元拼接面 ${tw.toFixed(2)} mm³：调「拼接面偏移」或长螺丝角度`);
  let tb = 0, to = 0; const T = TIE_SPECS[p.tieSize];
  if (p.tieCount > 0) { if (p.tieR - T.clear / 2 - p.minWall < p.dartD / 2 + p.boreClear) warnings.push('长螺丝孔离中心通道太近'); if (p.tieR + T.headD / 2 + 0.2 + p.minWall > p.tubeOD / 2) warnings.push('长螺丝沉孔离外表面太近（< 最小壁厚）'); }
  // M3 孔（腔外部分）与中心通道
  const bore = R.makeCylinder(p.dartD / 2 + p.boreClear, 400, [0, -200, 0], [0, 1, 0]);
  const W = pocketW(p), scr = screwParts(R, p, e2).cut(cylZ(R, p.fR + p.pocketClear + 2 * e2, -W / 2, W / 2));
  const sb = vol(R, placeAt(scr, p, 0, 0).intersect(bore));
  if (sb > 1e-3) warnings.push(`M3 孔与软弹通道壁厚不足 ${p.minWall} mm（重叠 ${sb.toFixed(2)} mm³）`);
  const si = screwInfo(p);
  if (p.nutType === 'tap' && si.engage < 4) warnings.push(`自攻孔旋合长度仅 ${si.engage?.toFixed(1)} mm（建议 ≥ 4）`);
  if (p.depth <= 0) warnings.push('吃深 ≤ 0：法兰接触不到软弹');
  if (p.bossD / 2 >= p.bRo - 0.3) warnings.push('支撑凸台直径过大，会顶到轴承外圈');
  if (p.tieCount > 0 && p.layers > 1 && effStagger(p) % unitSpan(p) !== 0) warnings.push('层间错角 ≠ 0：上下层长螺丝孔对不齐，长螺丝无法贯穿（请用错角 0 或把长螺丝数设 0）');
  // 底座：与第 1 层单元贴合面 Y=0；检查轴承/螺丝/螺帽/螺母实占空间（含 minWall 外扩）不进入底座，中心孔不挡软弹，长螺丝孔在底座内的壁厚
  let baseVol = 0, baseVolWall = 0;
  if (hasBase(p)) {
    const bs = buildBase(R, p), c0 = layerCutters(R, p, cutterLocal(R, p, 0, true), layerY(p, 0), 0), cw = layerCutters(R, p, cutterLocal(R, p, Math.min(e2, 0.9 * p.endPad), true), layerY(p, 0), 0);   // 与层间贴合面同一标准（余量 endPad）
    baseVol = vol(R, bs.clone().intersect(c0)); baseVolWall = vol(R, bs.clone().intersect(cw));
    if (baseVol > 1e-3) warnings.push(`第 1 层轴承/螺丝实体伸进底座 ${baseVol.toFixed(2)} mm³：增大「单元上下余量」或层距`);
    else if (baseVolWall > 1e-3) warnings.push(`第 1 层螺丝/轴承到底座顶面距离不足（< 单元余量 ${p.endPad}）（${baseVolWall.toFixed(2)} mm³）`);
    if (p.baseBoreD < p.dartD + 2 * p.boreClear - 1e-6) warnings.push(`底座中心孔 Ø${p.baseBoreD} 小于软弹通道 Ø${f2(p.dartD + 2 * p.boreClear)}，会挡软弹`);
    if (p.baseBoreD / 2 + p.minWall > p.tieR - T.clear / 2) warnings.push('底座中心孔离长螺丝孔太近');
    if (p.tieCount > 0) { const ti = tieInfo(p);
      if (tipAtBase(p) && ti.engage < 2) warnings.push(`底座自攻旋合仅 ${ti.engage.toFixed(1)} mm（建议底座厚 ≥ 2）`);
      if (!tipAtBase(p) && p.baseT < T.headH + p.minWall) warnings.push(`底座厚 ${p.baseT} 放不下螺帽沉孔（需 ≥ ${f2(T.headH + p.minWall)}）`); }
  }
  return { baseVol, baseVolWall, overlapVol: ov, layerVol: lv, tieVol: tv, tieWedgeVol: tw, screwBoreVol: sb, nMax, ok: warnings.length === 0, warnings };
}
