import opencascade from 'replicad-opencascadejs'; import * as R from 'replicad';
import { GEOM_DEFAULTS, resolve, checkInterference } from './geom.js';
const oc = await opencascade({ locateFile: () => './node_modules/replicad-opencascadejs/dist/replicad_single.wasm' }); R.setOC(oc);
for (const c of JSON.parse(process.argv[2])) { const p = resolve(R, { ...GEOM_DEFAULTS, ...c }); const k = checkInterference(R, p);
 console.log(JSON.stringify(c), 'pitch', p.pitch, 'tie', k.tieVol.toFixed(2), 'wedge', k.tieWedgeVol.toFixed(2), 'bore', k.screwBoreVol.toFixed(3), 'nMax', k.nMax, k.warnings.length); }
