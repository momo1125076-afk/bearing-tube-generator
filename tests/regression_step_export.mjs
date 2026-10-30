// STEP/STL 导出按钮真实点击回归：node tests/regression_step_export.mjs <url> <下载目录> [A|B]
// url 可以是 http://.../index.html 或 file:///.../index.html（双击打开的情况）
const puppeteer = (await import('puppeteer-core')).default;
import fs from 'fs';
const url = process.argv[2], dir = process.argv[3], mode = process.argv[4] || 'A';
fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
const b = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: 'new', protocolTimeout: 900000, args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--allow-file-access-from-files'] });
const p = await b.newPage(); const errs = []; let fail = 0;
const ok = (n, c, d = '') => { console.log((c ? 'PASS ' : 'FAIL ') + n + (d ? '  ' + d : '')); if (!c) fail++; };
p.on('pageerror', e => errs.push('PAGEERR ' + e.message));
const s = await p.target().createCDPSession(); await s.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: dir });
await p.goto(url); await p.waitForFunction(() => window.exporters && window.__ocReady, { timeout: 180000 });
// 生成前（或生成中）点击：不能静默，必须有提示（没有模型时提示先生成）
await p.evaluate(() => { window.__expMsg = null; });
await p.click('#e11'); await p.waitForFunction(() => window.__expMsg && window.__expMsg.ok !== null, { timeout: 300000 });
let m = await p.evaluate(() => window.__expMsg);
ok(`${mode}：生成前点 STEP 不静默`, m && (m.ok === true || m.t.includes('生成')), m && m.t.slice(0, 40));
await new Promise(r => setTimeout(r, 1500)); for (const f of fs.readdirSync(dir)) fs.rmSync(dir + '/' + f);
await p.evaluate(m => { const e = document.querySelector('#f_unitMode'); e.value = m; e.dispatchEvent(new Event('change')); }, mode);
await p.click('#gen'); await p.waitForFunction(() => window.__last && !document.querySelector('#gen').disabled, { timeout: 600000 });
const out = [];
const pm = v => p.evaluate(v => { const r = document.querySelector(`input[name="pmode"][value="${v}"]`); r.checked = true; r.dispatchEvent(new Event('change', { bubbles: true })); }, v);
for (const [id, suf] of [['e11', '_whole_print.step'], ['SPLIT'], ['e1', '_unit.step'], ['e7', '_base.step'], ['e9', '_all_parts.step'], ['e3', '_assembly.step'], ['e4', 'MF63ZZ.step']]) {
  if (id === 'SPLIT') { await pm('0'); await p.click('#gen'); await new Promise(r => setTimeout(r, 300)); await p.waitForFunction(() => !document.querySelector('#gen').disabled, { timeout: 600000 }); continue; }
  const before = new Set(fs.readdirSync(dir)); const t = Date.now(); await p.click('#' + id); let f = null;
  while (Date.now() - t < 300000) { const n = fs.readdirSync(dir).filter(x => !before.has(x) && !x.endsWith('.crdownload')); if (n.length) { f = n[0]; break; } await new Promise(r => setTimeout(r, 400)); }
  await p.waitForFunction(() => !window.__expMsg || window.__expMsg.ok !== null, { timeout: 300000 });
  m = await p.evaluate(() => window.__expMsg);
  const sz = f ? fs.statSync(dir + '/' + f).size : 0;
  ok(`${mode}：${id} 下载 ${suf}`, f && f.endsWith(suf) && sz > 1000 && m.ok === true, `${f} ${sz}B ${m && m.t.slice(0, 40)}`);
  if (f) out.push(dir + '/' + f);
}
ok(`${mode}：无未捕获异常`, errs.length === 0, errs.join(' | '));
fs.writeFileSync(dir + '/step_files.json', JSON.stringify(out));
await b.close();
console.log(fail ? `失败 ${fail} 项` : '全部通过（接着跑 python3 tests/check_step_files.py ' + dir + '）'); process.exit(fail ? 1 : 0);
