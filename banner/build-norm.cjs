/* Баннер TakeWord для демо-дея nFactorial — пересборка дизайна «norm» с нуля.
 *
 * Тот же формат, что вариант из нейронки (banner/example/norm.png), но собран
 * кодом в ПОЛНОМ размере фрейма 2276×5121 (в ~2.7 раза чётче для печати):
 *  - синий градиент, реальная иконка аппки, TakeWord + сабтайтл с бирюзой
 *  - два телефона с реальными скринами, статус-бар срезан (TestFlight скрыт)
 *  - карточки: объединённая «Daily streaks + Daily quests» (оранжевое пламя +
 *    мишень), «Point & learn» (визир), «Smart review» (стрелка повтора)
 *  - QR-карточка внизу ПО ЦЕНТРУ
 * Верхние ~222px — чёрные (под нетронутый хедер шаблона), правый верх до
 * y≈540 пуст — там окошко vote here.
 *
 * Собрать: node banner/build-norm.cjs  →  banner/out/banner-final.png
 */
const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const W = 2276;
const H = 5121;
const f = (p) => 'file://' + path.join(__dirname, p);
const ROOT = path.resolve(__dirname, '..');

const CAMERA = f('screen/IMG_6593.PNG');
const COLLECTION = f('screen/IMG_6596.PNG');
const QR = f('assets/qr.png');
const APPICON = 'file://' + path.join(ROOT, 'assets', 'images', 'icon.png');

// Скрины 1170×2532; срезаем верх: у камеры — время+«TestFlight» (130px),
// у коллекции — до «Good morning» (270px), чтобы заголовок не лез под островок
const SHOT_W = 1170;

const phone = (screenW, crop) => {
  const screenH = Math.round((screenW * (2532 - crop)) / SHOT_W);
  return { screenW, screenH, pad: 18, crop };
};
const CAM = phone(940, 130);
const COL = phone(820, 0); // статус-бар оставляем: белый фон, время выглядит естественно

const CYAN = '#3FD9F6';
const BLUE = '#1673E6';

// --- иконки (SVG, единый стиль; пламя — оранжевое как в оригинале) ---
const icoFlame = `
  <svg viewBox="0 0 48 48">
    <defs><linearGradient id="fg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#FFB53E"/><stop offset="1" stop-color="#F58414"/>
    </linearGradient></defs>
    <path fill="url(#fg)" fill-rule="evenodd" d="
      M25 4 C26.5 10 32 14 35.5 19.5 C38.5 24.5 38.5 30.5 35.5 35.5
      C32.5 40.5 28 43.5 23 43.5 C17.5 43.5 12.5 40.5 10.5 34.5
      C8 27.5 11 21.5 15 16.5 C18 12.5 23 8.5 25 4 Z
      M23 26 C26 29 29 31 29 34.5 C29 38.5 26 41.5 23 41.5
      C20 41.5 17 38.5 17 34.5 C17 31 20 29 23 26 Z"/>
  </svg>`;
const icoTarget = `
  <svg viewBox="0 0 48 48" fill="none" stroke="#fff" stroke-width="4">
    <circle cx="24" cy="24" r="19"/><circle cx="24" cy="24" r="10"/>
    <circle cx="24" cy="24" r="3" fill="#fff" stroke="none"/>
  </svg>`;
const icoViewfinder = `
  <svg viewBox="0 0 48 48" fill="none" stroke="#fff" stroke-width="4.4" stroke-linecap="round">
    <path d="M15 5H10a5 5 0 0 0-5 5v5"/><path d="M33 5h5a5 5 0 0 1 5 5v5"/>
    <path d="M15 43h-5a5 5 0 0 1-5-5v-5"/><path d="M33 43h5a5 5 0 0 0 5-5v-5"/>
    <circle cx="24" cy="24" r="5.5" fill="#fff" stroke="none"/>
  </svg>`;
const icoRefresh = `
  <svg viewBox="0 0 48 48" fill="none" stroke="#fff" stroke-width="4.4" stroke-linecap="round" stroke-linejoin="round">
    <path d="M41 24a17 17 0 1 1-5-12"/><path d="M41 6v8h-8"/>
  </svg>`;
const arrow = `
  <svg viewBox="0 0 120 90" fill="none" stroke="${BLUE}" stroke-width="6" stroke-linecap="round">
    <path d="M112 18 C96 66 58 78 18 64"/>
    <path d="M34 78 L16 63 L36 52"/>
  </svg>`;

const chipCss = `
  background:linear-gradient(180deg,rgba(255,255,255,.20),rgba(255,255,255,.09));
  border:3px solid rgba(255,255,255,.32);
  box-shadow:0 40px 80px -18px rgba(5,20,70,.45);
  backdrop-filter:blur(26px);-webkit-backdrop-filter:blur(26px);`;

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${W}px;height:${H}px}
body{position:relative;overflow:hidden;
  font-family:-apple-system,"SF Pro Display","Helvetica Neue",system-ui,sans-serif;
  -webkit-font-smoothing:antialiased;color:#fff;
  background:linear-gradient(178deg,#1F87ED 0%,#1668DA 42%,#0C46B4 100%)}

/* свечения за телефонами + фактура снизу справа */
.glow{position:absolute;border-radius:50%}
.g1{left:520px;top:1650px;width:2100px;height:2100px;
  background:radial-gradient(circle,rgba(160,215,255,.32) 0%,rgba(160,215,255,0) 60%)}
.g2{left:-500px;top:3400px;width:1800px;height:1800px;
  background:radial-gradient(circle,rgba(10,30,110,.5) 0%,rgba(10,30,110,0) 62%)}
.tex{position:absolute;right:0;bottom:0;width:1100px;height:900px;
  background:repeating-linear-gradient(48deg,rgba(255,255,255,.05) 0 4px,transparent 4px 30px);
  -webkit-mask-image:radial-gradient(circle at 100% 100%,#000 20%,transparent 72%)}

/* хедер-зона: чёрная, сливается с шапкой шаблона */
.headzone{position:absolute;left:0;top:0;right:0;height:222px;background:#000}

/* бренд-блок */
.appicon{position:absolute;left:238px;top:360px;width:268px;height:268px;
  border-radius:64px;overflow:hidden;box-shadow:0 36px 70px rgba(4,18,60,.45)}
.appicon img{width:100%;height:100%}
.title{position:absolute;left:230px;top:688px;font-size:238px;font-weight:800;
  letter-spacing:-7px;text-shadow:0 16px 44px rgba(4,20,70,.35)}
.sub{position:absolute;left:240px;top:1032px;font-size:97px;font-weight:650;line-height:1.24}
.sub em{font-style:normal;color:${CYAN}}

/* телефоны */
.ph{position:absolute;background:#111216;box-shadow:
  0 110px 190px -40px rgba(3,15,55,.75),0 40px 80px rgba(3,15,55,.4),
  0 0 0 3px rgba(255,255,255,.10)}
.ph .scr{overflow:hidden;position:relative;background:#000}
.ph .scr img{position:absolute;left:0;width:100%}
.isl{position:absolute;left:50%;transform:translateX(-50%);background:#0B0C0E;border-radius:999px;z-index:3}

.cam{left:206px;top:1560px;padding:${CAM.pad}px;border-radius:104px;
  transform:rotate(-6.5deg);z-index:5}
.cam .scr{width:${CAM.screenW}px;height:${CAM.screenH}px;border-radius:88px}
.cam .scr img{top:${-Math.round((CAM.crop * CAM.screenW) / SHOT_W)}px}
.cam .isl{top:${CAM.pad + 24}px;width:252px;height:62px}

.col{left:1118px;top:1710px;padding:${COL.pad}px;border-radius:94px;
  transform:rotate(6.5deg);z-index:4}
.col .scr{width:${COL.screenW}px;height:${COL.screenH}px;border-radius:80px}
.col .scr img{top:0}
/* белая заплатка поверх «◀ TestFlight» в статус-баре коллекции */
.col .tf{position:absolute;left:8px;top:52px;width:180px;height:50px;background:#fff;z-index:2}
.col .isl{top:${COL.pad + 22}px;width:220px;height:56px}

/* карточки-чипы: иконка + текст, всё центрировано флексом */
.chip{position:absolute;display:flex;align-items:center;gap:30px;
  padding:44px 56px;border-radius:58px;${chipCss}}
.chip svg{width:74px;height:74px;flex:0 0 74px}
.chip .t{font-size:66px;font-weight:650;white-space:nowrap}

.daily{position:absolute;left:1580px;top:1130px;display:flex;flex-direction:column;
  gap:44px;padding:56px 62px;border-radius:64px;transform:rotate(2.5deg);${chipCss}}
.daily .row{display:flex;align-items:center;gap:30px}
.daily svg{width:76px;height:76px;flex:0 0 76px}
.daily .t{font-size:64px;font-weight:650;white-space:nowrap}

.point{left:96px;top:3180px;transform:rotate(-3deg);z-index:6}
.smart{left:1440px;top:3510px;transform:rotate(2deg);z-index:6}

/* QR-карточка внизу по центру */
.qr{position:absolute;left:50%;top:4210px;transform:translateX(-50%);
  width:1500px;display:flex;align-items:center;gap:74px;
  background:#fff;border-radius:74px;padding:64px 74px;
  box-shadow:0 70px 130px -30px rgba(3,15,55,.6)}
.qr img{width:470px;height:470px;flex:0 0 470px}
.qr .h{font-size:106px;font-weight:800;color:${BLUE};line-height:1.06;letter-spacing:-2px}
.qr .s{margin-top:30px;font-size:60px;font-weight:600;color:#5E6470;line-height:1.32}
.qr .ar{width:190px;height:142px;margin-top:26px;margin-left:270px}
</style></head><body>
  <div class="glow g1"></div><div class="glow g2"></div><div class="tex"></div>
  <div class="headzone"></div>

  <div class="appicon"><img src="${APPICON}"></div>
  <div class="title">TakeWord</div>
  <div class="sub">Learn languages<br>through <em>your camera.</em></div>

  <div class="daily">
    <div class="row">${icoFlame}<div class="t">Daily streaks</div></div>
    <div class="row">${icoTarget}<div class="t">Daily quests</div></div>
  </div>

  <div class="ph cam"><div class="isl"></div><div class="scr"><img src="${CAMERA}"></div></div>
  <div class="ph col"><div class="isl"></div><div class="scr"><img src="${COLLECTION}"><div class="tf"></div></div></div>

  <div class="chip point">${icoViewfinder}<div class="t">Point &amp; learn</div></div>
  <div class="chip smart">${icoRefresh}<div class="t">Smart review</div></div>

  <div class="qr">
    <img src="${QR}">
    <div>
      <div class="h">Try TakeWord<br>now</div>
      <div class="s">Scan the QR code to start<br>learning your first word!</div>
      <div class="ar">${arrow}</div>
    </div>
  </div>
</body></html>`;

(async () => {
  const out = path.join(__dirname, 'out');
  fs.mkdirSync(out, { recursive: true });
  const htmlPath = path.join(out, 'banner-final.html');
  fs.writeFileSync(htmlPath, html);

  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: W, height: H },
    deviceScaleFactor: 1,
  });
  await page.goto('file://' + htmlPath);
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(out, 'banner-final.png') });
  await browser.close();
  console.log('OK → banner/out/banner-final.png (' + W + '×' + H + ')');
})();
