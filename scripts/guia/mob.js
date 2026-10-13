const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs=require('fs'); eval(fs.readFileSync(__dirname+'/demo.inc','utf8'));
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const c = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  const p = await c.newPage(); await p.addInitScript(s => localStorage.setItem('bloco-a-bloco-v1', s), JSON.stringify(proj));
  await p.goto(process.argv[2]); await p.waitForTimeout(2500);
  await p.evaluate(() => { Object.assign(window.__bab.cam, { yaw: 0.55, pitch: 0.5, dist: 34, tx: 11, ty: 3, tz: 12 }); window.__bab.update(); }); await p.waitForTimeout(800);
  await p.screenshot({ path: process.argv[3], type: 'jpeg', quality: 82 }); await b.close();
})();
