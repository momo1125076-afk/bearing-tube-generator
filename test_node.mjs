import opencascade from 'replicad-opencascadejs';
import * as R from 'replicad'; import fs from 'fs';
import { GEOM_DEFAULTS, resolve, buildBody, buildBearings, checkInterference, frames, tubeLength, totalLength, buildBase, screwInfo, tieInfo, assembleUnits } from './geom.js';
const oc = await opencascade({ locateFile: () => './node_modules/replicad-opencascadejs/dist/replicad_single.wasm' });
R.setOC(oc);
const vol = s => R.measureShapeVolumeProperties(s).volume;
const cases = JSON.parse(process.argv[2] || '[{}]');
for (const c of cases) {
  const t = Date.now(); const p = resolve(R, { ...GEOM_DEFAULTS, withCompare: true, ...c });
  const chk = checkInterference(R, p); const asm = assembleUnits(R, p), body = R.makeCompound([...(asm.base ? [asm.base.clone()] : []), ...asm.units.map(u => u.shape)]), br = buildBearings(R, p), unit = asm.kinds.bottom;
  let inter = 0; for (const b of br) inter += vol(body.clone().intersect(b.clone()));
  const tag = c.tag || 'default';
  if (c.export !== false) {
    fs.writeFileSync(`out/${tag}_unit.stl`, Buffer.from(await unit.blobSTL({ binary: true, tolerance: 0.02, angularTolerance: 0.1 }).arrayBuffer()));
    fs.writeFileSync(`out/${tag}_unit.step`, Buffer.from(await unit.blobSTEP().arrayBuffer()));
    if (asm.base) { fs.writeFileSync(`out/${tag}_base.step`, Buffer.from(await asm.base.blobSTEP().arrayBuffer())); fs.writeFileSync(`out/${tag}_base.stl`, Buffer.from(await asm.base.blobSTL({ binary: true, tolerance: 0.02, angularTolerance: 0.1 }).arrayBuffer())); }
    fs.writeFileSync(`out/${tag}_body.step`, Buffer.from(await body.blobSTEP().arrayBuffer()));
    fs.writeFileSync(`out/${tag}_body.stl`, Buffer.from(await body.blobSTL({ binary: true, tolerance: 0.02, angularTolerance: 0.1 }).arrayBuffer()));
    fs.writeFileSync(`out/${tag}_assembly.step`, Buffer.from(await R.makeCompound([body.clone(), ...br.map(b => b.clone())]).blobSTEP().arrayBuffer()));
  }
  console.log(JSON.stringify({ tag, pitch: p.pitch, stagger: p._cmp, len: +totalLength(p).toFixed(2), stackLen: +tubeLength(p).toFixed(2), baseVol: asm.base ? +vol(asm.base).toFixed(1) : 0, ext: p._ext, vol: +vol(body).toFixed(1), unitVol: +vol(unit).toFixed(1), nUnits: asm.units.length, inter: +inter.toFixed(4), screw: screwInfo(p), tie: tieInfo(p), chk, ms: Date.now() - t }));
  if (tag === 'default') fs.writeFileSync('out/frames_js.json', JSON.stringify(frames(p)));
}
