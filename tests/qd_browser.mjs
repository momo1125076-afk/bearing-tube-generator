// 快拆轴承底座 / 装饰外壳 回归（t35–t40）：node tests/qd_browser.mjs [URL] [下载目录]
// 依赖：npm i puppeteer-core；本机 Chrome（CHROME=/path/to/chrome 可覆盖）。先在网页目录起静态服务：python3 -m http.server 8765
import fs from 'fs'; import path from 'path';
let puppeteer; try { puppeteer = (await import('puppeteer-core')).default; } catch (e) { puppeteer = (await import(process.env.PUPPETEER_PATH || '/workspace/bearing_tool/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js')).default; }
const URL_ = process.argv[2] || 'http://127.0.0.1:8765/index.html', DL = path.resolve(process.argv[3] || './tests/out');
const SHOTS = process.env.SHOTS || DL; fs.mkdirSync(DL, { recursive: true });
const b = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'], protocolTimeout: 900000 });
const page = await b.newPage(); await page.setViewport({ width: 1440, height: 900 });
const errs = []; page.on('pageerror', e => errs.push(String(e)));
const cdp = await page.createCDPSession(); await cdp.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: DL });
let fail = 0; const R = []; const ok = (n, p, d = '') => { R.push({ n, p, d }); if (!p) fail++; console.log(p ? 'PASS' : 'FAIL', n, d); };
await page.goto(URL_, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => document.body.dataset.ready === '1', { timeout: 300000 });
const set = async (k, v) => page.evaluate((k, v) => { const e = document.getElementById('f_' + k); e.value = String(v); e.dispatchEvent(new Event(e.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); e.dispatchEvent(new Event('input', { bubbles: true })); }, k, v);
const gen = async () => { await page.evaluate(() => { document.body.dataset.ready = '0'; document.querySelector('#gen').click(); }); await page.waitForFunction(() => document.body.dataset.ready === '1', { timeout: 300000 }); return page.evaluate(() => window.__qd); };
const nSolid = (fn) => page.evaluate(async (fn) => { const t = await window.exporters[fn]().text(); return (t.match(/MANIFOLD_SOLID_BREP/g) || []).length; }, fn);
// 旧分享码兼容：不含新字段的码 → 圆形底座、默认参数
const old = await page.evaluate(() => { const a = window.__shareApi, c = a.encodeShare({ ...a.decodeShare(a.encodeShare({ unitMode: 'A' })), unitMode: 'A' }), d = a.decodeShare(c); return { baseType: d.baseType, qdN: d.qdN, springOD: d.springOD, shellOn: d.shellOn }; });
ok('旧分享码兼容（无新字段 → 圆形底座）', old.baseType === 'round' && old.springOD === 5 && +old.shellOn === 0, JSON.stringify(old));
await set('baseType', 'qd'); await set('shellOn', 1); await set('decoStyle', 'diamond');
for (const n of (process.env.QN ? [+process.env.QN] : [2, 3, 6])) {
  await set('qdN', n); await set('shellFixN', n === 6 ? 2 : 3); const q = await gen();
  const chk = await page.$eval('#check', e => e.innerText), ws = await nSolid('wholeStep'), ss = await nSolid('shellStep');
  ok(`快拆底座 N=${n}：卡扣数、盖板 Ø≤40、弹簧 5×10×0.4、最小截面 ≥6.4、无干涉、融合 STEP 单实体、外壳 STEP 单实体`, q && q.n === n && q.od <= 40 && q.od >= q.minOD && q.clipSec >= 6.4 && chk.includes('无干涉') && chk.includes('Ø5×10') && chk.includes('线径 0.4') && ws === 1 && ss === 1 && q.shell && 2 * q.shell.ro <= 40, JSON.stringify({ n: q && q.n, od: q && q.od, minOD: q && q.minOD, ws, ss, clipSec: q && q.clipSec, chk: chk.slice(0, 260) }));
}
await set('qdDiscOD', 20); const q2 = await gen(); ok('盖板外径下限夹紧', q2.od === q2.minOD && q2.od > 20, JSON.stringify(q2.od));
await set('qdDiscOD', 50); const q3 = await gen(); ok('盖板外径上限 40', q3.od === 40, String(q3.od)); await set('qdDiscOD', 36);
const code = await page.evaluate(() => window.__shareApi.encodeShare(window.__shareApi.read ? window.__shareApi.read() : {}));
const back = await page.evaluate(c => { const d = window.__shareApi.decodeShare(c); return { baseType: d.baseType, qdN: d.qdN, shellOn: d.shellOn, decoStyle: d.decoStyle }; }, code);
ok('分享码写入新参数并可还原', back.baseType === 'qd' && +back.qdN === 6 && +back.shellOn === 1 && back.decoStyle === 'diamond', JSON.stringify(back));
await set('printWhole', 0); await gen(); const bs = await nSolid('baseStep'); ok('拆分：快拆底座 STEP 单实体', bs === 1, String(bs)); await set('printWhole', 1);
await set('qdN', 3); await set('shellFixN', 3); await set('decoStyle', 'none'); await gen();
await page.screenshot({ path: path.join(SHOTS, 'qd_desktop.png') });
await page.setViewport({ width: 420, height: 900 }); await new Promise(r => setTimeout(r, 600)); await page.evaluate(() => document.querySelector('#check').scrollIntoView({ block: 'start' }));
await page.screenshot({ path: path.join(SHOTS, 'qd_narrow.png') });
ok('无页面 JS 报错', errs.length === 0, errs.join(' | '));
await b.close(); console.log(fail ? `\n${fail} 项失败` : '\n全部通过'); process.exit(fail ? 1 : 0);
