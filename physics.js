// 软弹过轴承 估算模型（时间步进，按「单元」累加）。单位：SI 内部计算。估算模型，需实测校准！
// 每个单元 = 1 个轴承接触点；第 L 层单元位于 y = L·pitch。软弹头部到达该层后开始接触，
// 接触行程 = 软弹长度 + 法兰接触弦长；层距 < 软弹长度时多层同时接触（紧邻叠放时的实际情况）。
export const PHYS_DEFAULTS = {
  m_g: 1.0, v0: 55, dartD: 13, dartL: 38, kI: 0.4,
  depth: 0.66, alphaDeg: 25, perLayer: 3, layers: 2, pitch: 11.6,
  flangeR: 3.6, bearingRi: 1.5, mb_g: 0.4,
  kn: 5, mu: 0.5, crr: 0.05, bearingDrag: 0.0
};
export function simulate(p0) {
  const p = { ...PHYS_DEFAULTS, ...p0 };
  const m = p.m_g / 1000, R = p.dartD / 2000, rc = R - p.depth / 1000, a = p.alphaDeg * Math.PI / 180;
  const I = p.kI * m * R * R, Rf = p.flangeR / 1000, ro = 0.003, ri = p.bearingRi / 1000;
  const Ib = 0.5 * (p.mb_g / 1000) * (ro * ro + ri * ri);
  const Nf = p.kn * p.depth;
  const Lc = 2 * Math.sqrt(Math.max(2 * p.flangeR * p.depth - p.depth ** 2, 0));
  const Lint = (p.dartL + Lc) / 1000, pitch = p.pitch / 1000, nL = p.layers, n = p.perLayer;
  const E0 = 0.5 * m * p.v0 ** 2, ca = Math.cos(a), sa = Math.sin(a), eps = 0.05, dt = 2e-7;
  let v = p.v0, w = 0, x = 0, Eheat = 0, Ehyst = 0;
  const wb = new Array(nL).fill(0), done = new Array(nL).fill(null), unitE = new Array(nL).fill(0);
  const xEnd = (nL - 1) * pitch + Lint;
  while (x < xEnd && v > 0.5) {
    let dv = 0, dw = 0;
    for (let L = 0; L < nL; L++) {
      const xr = x - L * pitch;
      if (xr < 0) continue;
      if (xr > Lint) { if (!done[L]) done[L] = { v, rpm: w * 30 / Math.PI, bearingRpm: wb[L] * 30 / Math.PI }; continue; }
      const sy = v - wb[L] * Rf * ca, st = w * rc - wb[L] * Rf * sa, sm = Math.hypot(sy, st), f = p.mu * Nf / (sm + eps);
      const Fy = -f * sy, Ft = -f * st, Fh = -p.crr * Nf;
      const tb = -(Fy * ca + Ft * sa) * Rf - p.bearingDrag / 1000 * Math.sign(wb[L]);
      dv += n * (Fy + Fh) / m * dt; dw += n * Ft * rc / I * dt; wb[L] += tb / Ib * dt;
      const eh = n * f * sm * sm * dt, ey = n * -Fh * v * dt; Eheat += eh; Ehyst += ey; unitE[L] += (eh + ey) / n;
    }
    v += dv; w += dw; x += v * dt;
  }
  for (let L = 0; L < nL; L++) if (!done[L]) done[L] = { v, rpm: w * 30 / Math.PI, bearingRpm: wb[L] * 30 / Math.PI };
  const Ebear = wb.reduce((s, q) => s + n * 0.5 * Ib * q * q, 0);
  const layersOut = done.map((d, L) => ({ ...d, unitLossmJ: (unitE[L] + 0.5 * Ib * wb[L] ** 2) * 1000 }));
  const wIdeal = p.v0 * Math.tan(a) / rc, Ek = 0.5 * m * v * v, Espin = 0.5 * I * w * w;
  return { v_out: v, dV: p.v0 - v, dVpct: (p.v0 - v) / p.v0 * 100, omega: w, rpm: w * 30 / Math.PI,
    rpmIdeal: wIdeal * 30 / Math.PI, spinEff: w / wIdeal, rc_mm: rc * 1000, Nf, Lc, overlapLayers: Math.min(nL, Math.ceil(Lint / Math.max(pitch, 1e-6))),
    E0, Ek, Espin, Ebear, Eheat, Ehyst, spinPct: Espin / E0 * 100, spinRatio: w * R / v, layersOut };
}
