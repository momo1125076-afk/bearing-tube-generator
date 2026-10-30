import opencascade from 'replicad-opencascadejs';
import * as R from 'replicad';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GEOM_DEFAULTS, resolve, assembleUnits, buildBearings, checkInterference, centerRadius, tubeLength, totalLength, hasBase, screwInfo, tieInfo } from './geom.js';
import { PHYS_DEFAULTS, simulate } from './physics.js';

const FIELDS = [
  ['单元 / 轴承布置', [
    ['depth', '法兰吃深 (mm)', 0.05, '法兰伸入软弹通道（Ø软弹）的深度'],
    ['alphaDeg', '轴承倾斜角 α (°)', 1, '轴承轴线相对切向的倾斜，决定自旋'],
    ['perLayer', '每层单元数 N', 1, '每个扇形单元 1 个轴承，均布、中心对齐'],
    ['layers', '层数', 1, ''],
    ['pitchMode', '层距模式', ['auto:紧邻（自动最小）', 'manual:手动'], '紧邻 = 单元自身腔/孔/螺帽/螺母刚好不伸进相邻单元的最小单元高'],
    ['pitch', '层距 = 单元高 (mm)', 0.1, '紧邻模式下自动计算（只读）'],
    ['staggerMode', '层间错角', ['none:不错开（长螺丝可贯穿）', 'half:错开半个角度', 'custom:自定义'], ''],
    ['staggerDeg', '自定义错角 (°)', 1, ''],
    ['phaseDeg', '起始相位 (°)', 0.1, '原模型 -0.33'],
    ['splitOffsetDeg', '拼接面偏移 (°)', 0.5, '扇形单元中心相对轴承的转角'],
    ['dartD', '软弹直径 (mm)', 0.1, ''], ['tubeOD', '单元外径 (mm)', 0.5, '原模型 Ø27'],
    ['boreClear', '通道单边间隙 (mm)', 0.05, '通道 = 软弹直径 + 2×间隙'],
    ['endPad', '单元上下余量 (mm)', 0.1, '紧邻层距 = 切削体轴向高度 + 2×余量'],
    ['pocketClear', '轴承腔间隙 (mm)', 0.05, ''], ['bossD', '内圈支撑凸台 Ø (mm)', 0.1, '只顶内圈，外圈自由转'], ['bossH', '凸台高 (mm)', 0.05, ''],
    ['minWall', '最小壁厚 (mm)', 0.1, '干涉检查用'], ['axialShift', '轴承沿轴线偏移 (mm)', 0.01, '原模型 -0.906'],
  ]],
  ['M3 销轴螺丝（每个轴承 1 根）', [
    ['nutType', '螺母侧', ['hex:M3 六角螺母槽', 'tap:Ø2.5 自攻孔', 'pin:Ø3 钢销（无螺丝，最紧凑）'], ''],
    ['screwClear', '通孔 Ø (mm)', 0.05, 'M3 通孔 3.2–3.4'],
    ['headType', '螺帽', ['socket:圆柱头 Ø5.5×3', 'button:半圆头 Ø5.7×1.65'], ''],
    ['headD', '螺帽沉孔 Ø (mm)', 0.1, ''], ['headH', '螺帽沉孔深 (mm)', 0.1, ''], ['headWall', '螺帽侧支撑壁厚 (mm)', 0.1, '腔壁到螺帽承压面'],
    ['nutAF', '螺母槽对边 (mm)', 0.05, 'M3 螺母 5.5 + 间隙'], ['nutT', '螺母槽厚 (mm)', 0.1, 'M3 螺母 2.4 + 间隙'], ['nutWall', '螺母侧支撑壁厚 (mm)', 0.1, ''],
    ['tapD', '自攻孔 Ø (mm)', 0.05, ''], ['pinHoleD', '钢销孔 Ø (mm)', 0.05, ''], ['screwSide', '螺帽朝向 (1/-1)', 2, ''],
  ]],
  ['长螺丝补强（轴向贯穿所有层）', [
    ['tieCount', '每单元长螺丝数 (0/1)', 1, '每个扇形单元 1 根，贯穿各层单元'],
    ['tieSize', '规格', ['M2:M2（原模型 Ø1.9/Ø2.0 孔）', 'M3:M3'], ''],
    ['tieEnd', '末端', ['tap:顶层自攻盲孔', 'nut:顶层螺母槽（通孔）'], ''],
    ['tieR', '长螺丝所在半径 (mm)', 0.05, '原模型 10.26'], ['tieAuto', '自动找角度 (1/0)', 1, ''], ['tieOffsetDeg', '长螺丝角度偏移 (°)', 0.5, '相对本单元轴承'],
  ]],
  ['底座（堆叠最末端，原 STEP solid 15 的底板）', [
    ['baseOn', '带底座 (1/0)', 1, '最终产物包含底座'],
    ['baseT', '底座厚 (mm)', 0.1, '原模型底板 2.4'],
    ['baseBoreD', '底座中心孔 Ø (mm)', 0.1, '原模型 Ø15，须 ≥ 软弹通道'],
    ['baseTie', '长螺丝在底座', ['tap:自攻孔（螺帽在顶层，原模型做法）', 'head:螺帽沉孔（从底座穿入）'], ''],
  ]],
  ['轴承 MF63ZZ', [['bRo', '外半径', 0.1], ['bRi', '内半径', 0.1], ['bW', '宽度', 0.1], ['fR', '法兰半径', 0.1], ['fT', '法兰厚', 0.1], ['mb_g', '旋转部分质量 (g)', 0.05, '默认整颗 0.4 g，偏保守']]],
  ['软弹 / 估算系数（需实测校准）', [
    ['m_g', '软弹质量 (g)', 0.05], ['v0', '初速度 (m/s)', 1], ['dartL', '软弹长度 (mm)', 1, '接触行程'],
    ['kI', '转动惯量系数 kI', 0.05, 'I = kI·m·R²'], ['kn', '泡沫法向刚度 (N/mm)', 0.5, '估计值'], ['mu', '摩擦系数 μ', 0.05, '估计值'],
    ['crr', '泡沫迟滞阻力系数', 0.01, '估计值'], ['bearingDrag', '轴承阻力矩 (N·mm)', 0.01, '']]]
];
const P = { ...PHYS_DEFAULTS, ...GEOM_DEFAULTS };
const $ = s => document.querySelector(s);
const form = $('#form');
for (const [title, fs] of FIELDS) {
  const g = document.createElement('fieldset'); g.innerHTML = `<legend>${title}</legend>`;
  for (const [k, label, step, tip] of fs) {
    const d = document.createElement('label'); d.title = tip || '';
    d.innerHTML = Array.isArray(step) ? `<span>${label}</span><select id="f_${k}">${step.map(o => { const [v, t] = o.split(/:(.*)/); return `<option value="${v}" ${String(P[k]) === v ? 'selected' : ''}>${t}</option>`; }).join('')}</select>`
      : `<span>${label}</span><input type="number" id="f_${k}" step="${step}" value="${P[k]}">`;
    g.appendChild(d);
  }
  form.appendChild(g);
}
function read() {
  for (const fs of FIELDS) for (const [k, , st] of fs[1]) { const el = $('#f_' + k); if (Array.isArray(st)) { P[k] = el.value; continue; } const v = parseFloat(el.value); if (!isNaN(v)) P[k] = v; }
  if (P.headType !== P._lastHead) { if (P._lastHead) { const hd = P.headType === 'button' ? [6.0, 1.9] : [5.8, 3.2]; P.headD = hd[0]; P.headH = hd[1]; $('#f_headD').value = hd[0]; $('#f_headH').value = hd[1]; } P._lastHead = P.headType; }
  $('#f_pitch').readOnly = P.pitchMode === 'auto';
  P.perLayer = Math.max(1, Math.round(P.perLayer)); P.layers = Math.max(1, Math.round(P.layers));
  P.dartD_phys = P.dartD; P.flangeR = P.fR; P.bearingRi = P.bRi;
  return { ...P, flangeR: P.fR, bearingRi: P.bRi };
}
const f = (x, n = 2) => Number(x).toFixed(n);
let RES = null;   // 最近一次几何解析结果（层距等）
function physics() {
  const p = read(); if (RES && P.pitchMode === 'auto') p.pitch = RES.pitch; const r = simulate(p);
  $('#phys').innerHTML = `
  <tr><th>出口速度</th><td><b>${f(r.v_out)} m/s</b></td><th>速度降低</th><td><b>${f(r.dV)} m/s (${f(r.dVpct, 1)}%)</b></td></tr>
  <tr><th>出口自旋</th><td><b>${f(r.rpm, 0)} rpm</b></td><th>理想无滑移自旋</th><td>${f(r.rpmIdeal, 0)} rpm</td></tr>
  <tr><th>自旋效率 ω/ω理想</th><td>${f(r.spinEff * 100, 1)}%</td><th>表面速比 ωR/v</th><td>${f(r.spinRatio, 3)}</td></tr>
  <tr><th>接触半径 r_c</th><td>${f(r.rc_mm)} mm</td><th>单点法向力 / 接触弦长</th><td>${f(r.Nf)} N / ${f(r.Lc)} mm</td></tr>
  <tr><th>初动能</th><td>${f(r.E0, 3)} J</td><th>出口动能</th><td>${f(r.Ek, 3)} J</td></tr>
  <tr><th>自旋能</th><td>${f(r.Espin * 1000, 2)} mJ (${f(r.spinPct, 2)}%)</td><th>轴承转动能</th><td>${f(r.Ebear * 1000, 1)} mJ</td></tr>
  <tr><th>滑移摩擦热</th><td>${f(r.Eheat * 1000, 1)} mJ</td><th>泡沫迟滞损耗</th><td>${f(r.Ehyst * 1000, 1)} mJ</td></tr>
  <tr><th>按单元累加</th><td colspan=3>层距 ${f(p.pitch, 1)} mm，软弹长 ${p.dartL} mm → 同时接触 ≈ ${r.overlapLayers} 层<br>${r.layersOut.map((l, i) => `第${i + 1}层（${p.perLayer} 个单元）离开时: ${f(l.v, 1)} m/s, ${f(l.rpm, 0)} rpm, 轴承 ${f(l.bearingRpm, 0)} rpm；每单元耗能 ${f(l.unitLossmJ, 1)} mJ`).join('<br>')}</td></tr>`;
  const depths = [0.2, 0.4, 0.6, 0.66, 0.8, 1.0, 1.2], Ls = [1, 2, 3, 4];
  let h = '<tr><th>吃深＼层数</th>' + Ls.map(l => `<th>${l} 层</th>`).join('') + '</tr>';
  for (const d of depths) h += `<tr><th>${d} mm</th>` + Ls.map(l => { const s = simulate({ ...p, depth: d, layers: l }); return `<td>${f(s.v_out, 1)} m/s<br>${f(s.rpm, 0)} rpm</td>`; }).join('') + '</tr>';
  $('#sweep').innerHTML = h;
  const as = [10, 15, 20, 25, 30, 35, 40];
  $('#sweepA').innerHTML = '<tr><th>倾斜角</th>' + as.map(a => `<th>${a}°</th>`).join('') + '</tr><tr><th>v_out / rpm</th>' +
    as.map(a => { const s = simulate({ ...p, alphaDeg: a }); return `<td>${f(s.v_out, 1)}<br>${f(s.rpm, 0)}</td>`; }).join('') + '</tr>';
}
form.addEventListener('input', () => { physics(); });

// ---------- 3D ----------
const view = $('#view'), renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(devicePixelRatio); view.appendChild(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color(0xf2f4f7);
const cam = new THREE.PerspectiveCamera(40, 1, 0.1, 5000); const ctl = new OrbitControls(cam, renderer.domElement);
scene.add(new THREE.HemisphereLight(0xffffff, 0x667788, 1.2)); const dl = new THREE.DirectionalLight(0xffffff, 1.5); dl.position.set(50, 80, 60); scene.add(dl);
let group = new THREE.Group(); scene.add(group);
function resize() { const w = view.clientWidth, h = view.clientHeight; renderer.setSize(w, h); cam.aspect = w / h; cam.updateProjectionMatrix(); }
addEventListener('resize', resize); new ResizeObserver(resize).observe(view);
(function loop() { requestAnimationFrame(loop); ctl.update(); renderer.render(scene, cam); })();
function toMesh(shape, color, opacity = 1) {
  const m = shape.mesh({ tolerance: 0.05, angularTolerance: 0.2 });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(m.vertices, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(m.normals, 3)); g.setIndex(m.triangles);
  return new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color, transparent: opacity < 1, opacity, metalness: 0.1, roughness: 0.6, side: THREE.DoubleSide }));
}
let current = null;
function generate() {
  resize(); const p0 = read(), st = $('#status'); st.textContent = '生成中…'; const t0 = performance.now();
  setTimeout(() => {
    try {
      const p = resolve(R, { ...p0, withCompare: $('#cmp').checked }); RES = p;
      if (p.pitchMode === 'auto') $('#f_pitch').value = p.pitch;
      if (p.tieAuto) $('#f_tieOffsetDeg').value = +p.tieOffsetDeg.toFixed(2);
      physics();
      const chk = checkInterference(R, p);
      const asm = assembleUnits(R, p), bearings = buildBearings(R, p);
      current = { p, asm, bearings };
      scene.remove(group); group = new THREE.Group();
      const cols = [0x4d8fd6, 0x6fb06a, 0xc9a43c, 0x9a6cc9, 0x4cb3b3, 0xc96c8f];
      for (const u of asm.units) group.add(toMesh(u.shape, cols[u.k % cols.length], $('#xray').checked ? 0.4 : 1));
      if (asm.base) group.add(toMesh(asm.base, 0x8a8f99, $('#xray').checked ? 0.55 : 1));
      for (const b of bearings) group.add(toMesh(b, 0xd65f4d));
      scene.add(group);
      const len = totalLength(p), stack = tubeLength(p), si = screwInfo(p), ti = tieInfo(p);
      if (ctl._len !== len) { const d = Math.max(len, 40) * 2.6; cam.position.set(d * 0.6, len / 2 + d * 0.25, d * 0.6); ctl.target.set(0, stack / 2 - (len - stack) / 2, 0); ctl._len = len; }
      const cmp = p._cmp ? `　参考（各层腔/孔交错嵌套、单元不再自洽时的最小层距）：不错开 ${p._cmp.none.pitch} mm / 错开 ${f(p._cmp.half.stagger, 1)}° ${p._cmp.half.pitch} mm` : '';
      $('#check').innerHTML = (chk.ok ? '<span class=ok>✔ 无干涉</span>' : '<span class=bad>✘ ' + chk.warnings.join('；') + '</span>') +
        `<br>层距（单元高）<b>${f(p.pitch, 1)} mm</b>（紧邻最小 ${p._unitPitch} mm）　管总长 <b>${f(len, 1)} mm</b>（${hasBase(p) ? `底座 ${p.baseT} + ` : ''}${p.layers}×${f(p.pitch, 1)}）　单元 ${p.layers}×${p.perLayer} = ${asm.units.length} 件，打印件种类 ${Object.keys(asm.kinds).length}　每层最大可行 <b>${chk.nMax}</b>　轴承轴线距管轴 ${f(centerRadius(p))} mm${cmp}` +
        `<br>销轴：${si.pin ? `Ø3 钢销 × <b>${si.L}</b> mm（孔 Ø${p.pinHoleD}）` : `<b>M3×${si.L}</b> ${p.headType === 'button' ? '半圆头 ISO7380' : '圆柱头 ISO4762'}，通孔 Ø${p.screwClear}，沉孔 Ø${p.headD}×${p.headH}，${p.nutType === 'hex' ? `M3 六角螺母槽 对边 ${p.nutAF}×${p.nutT}` : `Ø${p.tapD} 自攻孔，旋合 ${f(si.engage, 1)} mm`}，夹持（两支撑壁+腔）${f(si.grip, 1)} mm`}` +
        `${hasBase(p) ? `<br>底座：Ø${p.tubeOD}×${p.baseT}，中心孔 Ø${p.baseBoreD}，${p.tieCount > 0 ? `${p.perLayer}×${p.baseTie === 'tap' ? `Ø${({M2:1.8,M3:2.5})[p.tieSize]} 自攻孔` : '螺帽沉孔'}` : '无长螺丝孔'}；底座∩第1层实体 ${f(chk.baseVol, 3)} mm³` : ''}<br>长螺丝：${p.tieCount > 0 ? `每单元 1 根，共 ${p.perLayer} 根 <b>${ti.size}×${ti.L}</b>（${ti.mode === 'base-tap' ? `顶层螺帽沉孔深 ${f(ti.cbDepth, 1)}，拧进底座自攻孔 ${f(ti.engage, 1)} mm` : (p.tieEnd === 'tap' ? (hasBase(p) ? '底座螺帽沉孔，' : '') + '顶层自攻盲孔' : '顶层螺母')}），半径 ${p.tieR}，角度偏移 ${f(p.tieOffsetDeg, 1)}°${p.tieAuto && !p._tieFound ? ' <span class=bad>（扇形内找不到不干涉位置）</span>' : ''}` : '无'}`;
      st.textContent = `完成 ${f((performance.now() - t0) / 1000, 1)} s`;
      document.body.dataset.ready = '1';
    } catch (e) { st.textContent = '生成失败：' + e; console.error(e); }
  }, 20);
}
function dl_(blob, name) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000); }
const tag = () => { const p = current.p; return `bearing_unit_N${p.perLayer}x${p.layers}_a${p.alphaDeg}_d${p.depth}_H${p.pitch}`; };
const STL = { binary: true, tolerance: 0.02, angularTolerance: 0.1 };
const withBase = () => [...(current.asm.base ? [current.asm.base] : []), ...current.asm.units.map(u => u.shape)];
window.exporters = {
  unitStep: () => current.asm.kinds.bottom.blobSTEP(),
  unitStl: () => current.asm.kinds.bottom.blobSTL(STL),
  kindsStep: () => R.makeCompound(Object.values(current.asm.kinds).map((s, i) => s.clone().translate([i * (current.p.tubeOD + 5), 0, 0]))).blobSTEP(),
  kindsStl: () => R.makeCompound(Object.values(current.asm.kinds).map((s, i) => s.clone().translate([i * (current.p.tubeOD + 5), 0, 0]))).blobSTL(STL),
  baseStep: () => current.asm.base.clone().blobSTEP(),
  baseStl: () => current.asm.base.clone().blobSTL(STL),
  bodyStl: () => R.makeCompound(withBase().map(s => s.clone())).blobSTL(STL),
  bodyStep: () => R.makeCompound(withBase().map(s => s.clone())).blobSTEP(),
  asmStep: () => R.makeCompound([...withBase().map(s => s.clone()), ...current.bearings.map(b => b.clone())]).blobSTEP(),
  bearingStep: () => current.bearings[0].clone().blobSTEP()
};
$('#gen').onclick = generate;
$('#xray').onchange = generate;
$('#e1').onclick = () => dl_(exporters.unitStep(), tag() + '_unit.step');
$('#e2').onclick = () => dl_(exporters.unitStl(), tag() + '_unit.stl');
$('#e5').onclick = () => dl_(exporters.kindsStl(), tag() + '_unit_kinds.stl');
$('#e6').onclick = () => dl_(exporters.bodyStl(), tag() + '_all_parts.stl');
$('#e3').onclick = () => dl_(exporters.asmStep(), tag() + '_assembly.step');
$('#e7').onclick = () => current.asm.base ? dl_(exporters.baseStep(), tag() + '_base.step') : alert('未启用底座');
$('#e8').onclick = () => current.asm.base ? dl_(exporters.baseStl(), tag() + '_base.stl') : alert('未启用底座');
$('#e9').onclick = () => dl_(exporters.bodyStep(), tag() + '_all_parts.step');
$('#e4').onclick = () => dl_(exporters.bearingStep(), 'MF63ZZ.step');
$('#reset').onclick = () => { for (const fs of FIELDS) for (const [k] of fs[1]) $('#f_' + k).value = { ...PHYS_DEFAULTS, ...GEOM_DEFAULTS }[k]; physics(); generate(); };

physics(); resize();
$('#status').textContent = '加载 OpenCascade 内核（约 23 MB，首次较慢）…';
opencascade({ locateFile: () => './lib/replicad_single.wasm' }).then(oc => { R.setOC(oc); generate(); })
  .catch(e => $('#status').textContent = 'WASM 加载失败（请用本地服务器打开，而不是 file://）：' + e);
