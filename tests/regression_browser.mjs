// 回归检查（浏览器端到端）：node tests/regression_browser.mjs [网页URL] [下载目录]
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
ok('页面加载并完成默认生成', true);
const txt = await page.evaluate(() => document.body.innerText);
ok('「模型仅供参考，实际效果以现实为准」可见', txt.includes('模型仅供参考，实际效果以现实为准'));
ok('打赏码图片已加载', await page.$eval('#donate img', i => i.complete && i.naturalWidth > 50));
ok('「接受打赏」文字', txt.includes('接受打赏'));
// 布局：生成按钮在预览正下方、参数栏可独立滚动
const lay = await page.evaluate(() => { const v = document.querySelector('#view').getBoundingClientRect(), g = document.querySelector('#gen').getBoundingClientRect(), s = getComputedStyle(document.querySelector('#side')); return { below: g.top >= v.bottom - 2 && g.top - v.bottom < 80, genH: g.height, sideScroll: s.overflowY }; });
ok('生成按钮紧贴 3D 预览下方', lay.below, JSON.stringify(lay)); ok('生成按钮够大（≥48px）', lay.genH >= 48); ok('参数栏独立滚动', ['auto', 'scroll'].includes(lay.sideScroll));
// 分区折叠
const secs = await page.$$eval('details.psec', d => d.map(x => [x.dataset.sec, x.open]));
ok('参数分区 ≥ 8 个，均为可折叠面板', secs.length >= 8, JSON.stringify(secs));
await page.click('#secCloseAll'); ok('全部收起', await page.$$eval('details.psec', d => d.every(x => !x.open)));
await page.click('#secOpenAll'); ok('全部展开', await page.$$eval('details.psec', d => d.every(x => x.open)));
const saved = await page.evaluate(() => localStorage.getItem('bt_sec_open_v1')); ok('折叠状态写入 localStorage', !!saved && saved.includes('"print":1'), saved);
await page.click('#secCloseAll');
const set = async (k, v) => page.evaluate((k, v) => { const e = document.getElementById('f_' + k); e.value = String(v); e.dispatchEvent(new Event(e.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); e.dispatchEvent(new Event('input', { bubbles: true })); }, k, v);
const gen = async () => { await page.evaluate(() => { document.body.dataset.ready = '0'; document.querySelector('#gen').click(); }); await page.waitForFunction(() => document.body.dataset.ready === '1', { timeout: 300000 }); return page.evaluate(() => window.__last); };
// 收起状态下改参数 → 读取仍生效
{ const dl = await page.$eval('#f_layers', e => +e.value), da = await page.evaluate(() => +window.__last.baseAF), sd = await page.$eval('#f_slopeDrop', e => +e.value); ok('默认层数 = 3、圆形底座（baseAF=0）、斜面下移默认 3', dl === 3 && da === 0 && sd === 3, `${dl} ${da} ${sd}`); }
const pmode = async v => { await page.evaluate(v => { const r = document.querySelector(`input[name="pmode"][value="${v}"]`); r.checked = true; r.dispatchEvent(new Event('change', { bubbles: true })); }, v); };
{ const st = await page.evaluate(() => ({ r: document.querySelector('input[name="pmode"]:checked').value, pw: document.querySelector('#f_printWhole').value, sgHidden: document.querySelector('#f_splitGap').closest('label').style.display === 'none', splitBtn: document.querySelector('#e1').offsetParent === null ? 'none' : 'shown', fusedBtn: document.querySelector('#e11').offsetParent === null ? 'none' : 'shown' }));
  ok('默认「融合为单一实体」，拆分参数与分件按钮隐藏', st.r === '1' && +st.pw === 1 && st.sgHidden && st.splitBtn === 'none' && st.fusedBtn !== 'none', JSON.stringify(st)); }
await set('layers', 3); let L = await gen();
ok('折叠状态下参数读取正常（层数=3）', L.layers === 3);
const shareCode = await page.evaluate(() => window.__shareApi.encodeShare(window.__shareApi.read()));
for (const mode of ['A', 'B']) {
  await set('unitMode', mode); await set('layers', 3); L = await gen();
  const fl = L.foot.layers;
  ok(`${mode}：生成无干涉`, L.chkOk, L.warnings.join('；'));
  ok(`${mode}：每个叠加层都有自检记录`, fl.length === 2, JSON.stringify(fl));
  if (mode === 'A') ok('A：每个叠加层支撑脚存在（楔块 > 5 mm³）', fl.every(x => x.foot > 5), fl.map(x => x.foot?.toFixed(1)).join(','));
  ok(`${mode}：叠加层底面不悬空（< 1 mm²）`, fl.every(x => x.unsup < 1.0), fl.map(x => x.unsup.toFixed(2)).join(','));
  const chkTxt = await page.$eval('#check', e => e.innerText); ok(`${mode}：结果区显示支撑脚自检`, chkTxt.includes('叠加层支撑脚自检'));
  ok(`${mode}：默认融合（printWhole=1、无长螺丝）`, L.printWhole === 1 && L.tieCount === 0, `${L.printWhole} ${L.tieCount}`);
  await page.screenshot({ path: path.join(SHOTS, `page_${mode}3.png`) });
  const dl = async (id, name) => { const before = new Set(fs.readdirSync(DL)); await page.evaluate(id => document.getElementById(id).click(), id);
    let f = null; for (let i = 0; i < 400 && !f; i++) { await new Promise(r => setTimeout(r, 500)); f = fs.readdirSync(DL).find(x => !before.has(x) && !x.endsWith('.crdownload')); }
    ok(`${mode}：导出 ${id}`, !!f, f || ''); if (f) fs.renameSync(path.join(DL, f), path.join(DL, `${mode}3_${name}${path.extname(f)}`)); };
  await dl('e10', 'whole'); await dl('e11', 'whole');
  // 切到拆分 + 打印间隙 0.1
  await pmode('0'); await set('splitGap', 0.1); L = await gen();
  { const vis = await page.evaluate(() => [document.querySelector('#f_splitGap').closest('label').style.display, (document.querySelector('#e1').offsetParent === null ? 'none' : 'shown')]);
    ok(`${mode}：拆分模式显示打印间隙与分件按钮`, vis[0] !== 'none' && vis[1] !== 'none', vis.join(',')); }
  const t2 = await page.$eval('#check', e => e.innerText);
  ok(`${mode}：拆分生成无干涉、层间嵌合开、间隙 0.1`, L.chkOk && L.printWhole === 0 && L.splitGap === 0.1 && t2.includes('层间嵌合 开'), L.warnings.join('；'));
  for (const [id, name] of [['e5', 'kinds'], ['e8', 'base'], ['e3', 'asm']]) await dl(id, name);
  await set('splitGap', 0); await pmode('1');
  fs.writeFileSync(path.join(DL, `${mode}3_last.json`), JSON.stringify(L));
}
// 关闭支撑脚 → 自检必须报警（防止再次悄悄丢失）
await set('unitMode', 'A'); await set('footOn', 0); L = await gen();
ok('关闭支撑脚时自检报警', !L.chkOk && L.warnings.some(w => w.includes('支撑脚') || w.includes('悬空')), L.warnings.join('；'));
await set('footOn', 1);
// 融合模式：结果区给出装轴承方式
L = await gen();
{ const t = await page.$eval('#check', e => e.innerText); ok('融合：A 给出暂停放轴承高度、无长螺丝', L.tieCount === 0 && t.includes('暂停') && L.chkOk, L.warnings.join('；')); }
// 生成方式 / 打印间隙进分享码；间隙范围夹紧到 0 或 0.05–0.3
await pmode('0'); await set('splitGap', 0.3); await set('mateDepth', 1.5);
{ const api = await page.evaluate(() => JSON.stringify(window.__shareApi.decodeShare(window.__shareApi.encodeShare(window.__shareApi.read())))); ok('分享码包含 拆分 / 打印间隙 / 嵌合深度', api.includes('"printWhole":0') && api.includes('"splitGap":0.3') && api.includes('"mateDepth":1.5'), api.slice(0, 200)); }
await set('splitGap', 0.02); L = await gen(); ok('打印间隙 0.02 夹紧到 0.05', L.splitGap === 0.05, String(L.splitGap));
await set('splitGap', 0); await set('mateDepth', 1); await pmode('1');
// 分享码导入还原
await page.$eval('#shareIO', (e, c) => e.value = c, shareCode); await page.evaluate(() => { document.querySelector('#importAutoGen').checked = true; document.body.dataset.ready = '0'; });
await page.click('#btnImport'); await page.waitForFunction(() => document.body.dataset.ready === '1', { timeout: 300000 });
L = await page.evaluate(() => window.__last); ok('分享码导入还原（层数 3、模式 A、缺省为融合）', L.layers === 3 && L.unitMode === 'A' && L.printWhole === 1);
// 选项卡 + 反推
await page.click('.tab[data-tab="reverse"]'); ok('切到「按目标反推」', await page.$eval('#tab-reverse', e => !e.hidden));
ok('反推约束也是同款折叠面板', await page.$$eval('#rvExtra details.psec', d => d.length === 1));
await page.$eval('#rv_vt', e => { e.value = '40'; e.dispatchEvent(new Event('input', { bubbles: true })); });
await page.click('#rvRun'); await page.waitForFunction(() => /应用/.test(document.querySelector('#rvOut').innerText + document.querySelector('#rvMsg').innerText), { timeout: 120000 });
ok('反推给出方案', true); await page.screenshot({ path: path.join(SHOTS, 'page_reverse.png') });
await page.click('.tab[data-tab="manual"]');
await page.setViewport({ width: 420, height: 900 }); await new Promise(r => setTimeout(r, 400));
ok('窄屏变单栏', await page.evaluate(() => document.querySelector('#side').getBoundingClientRect().top > document.querySelector('#view').getBoundingClientRect().bottom));
await page.screenshot({ path: path.join(SHOTS, 'page_narrow.png'), fullPage: false });
ok('无页面 JS 报错', errs.length === 0, errs.join(' | '));
fs.writeFileSync(path.join(DL, 'browser_result.json'), JSON.stringify(R, null, 1));
await b.close(); console.log(fail ? `\n${fail} 项失败` : '\n全部通过'); process.exit(fail ? 1 : 0);
