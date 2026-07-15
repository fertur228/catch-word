/* Баннер TakeWord для демо-дея nFactorial (концепт К1 «графитовый флагман»).
 *
 * Рендерит ПОЛНЫЙ фон 2276×5121 (размер фрейма шаблона banner-templates-n17r).
 * Верхние ~230px — чистый чёрный: в Figma картинка кладётся на (0,0) и
 * отправляется НА ЗАДНИЙ ПЛАН (Send to back), так что нетронутый хедер
 * «nFactorial Incubator» и окошко vote here остаются поверх. Правый верх
 * (x>1600, y<540) оставлен пустым — там висит vote here.
 *
 * Собрать: node banner/build-banner.cjs  →  banner/out/banner-k1.png
 */
const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const W = 2276;
const H = 5121;
const f = (p) => 'file://' + path.join(__dirname, p);

const CAMERA = f('screen/IMG_6593.PNG'); // скрин камеры с визиром
const WORDMARK = f('assets/wordmark.png'); // белый вордмарк, прозрачный фон
const QR = f('assets/qr.png'); // QR → https://catch-words.com

// Скрин 1170×2532; срезаем статус-бар (время/TestFlight) сверху.
const SHOT_W = 1170;
const SHOT_H = 2532;
const SHOT_CROP_TOP = 150;

// Телефон
const SCREEN_W = 980;
const SCREEN_H = Math.round((SCREEN_W * (SHOT_H - SHOT_CROP_TOP)) / SHOT_W); // ≈1995
const BEZEL = 16;

const INK = '#1C1C1E'; // фирменный графит
const MUT = '#A3A3AC';

const iconViewfinder = `
  <svg viewBox="0 0 64 64" fill="none" stroke="#fff" stroke-width="4.5" stroke-linecap="round">
    <path d="M22 10h-8a4 4 0 0 0-4 4v8"/><path d="M42 10h8a4 4 0 0 1 4 4v8"/>
    <path d="M22 54h-8a4 4 0 0 1-4-4v-8"/><path d="M42 54h8a4 4 0 0 0 4-4v-8"/>
    <circle cx="32" cy="32" r="7" fill="#fff" stroke="none"/>
  </svg>`;
const iconQuest = `
  <svg viewBox="0 0 64 64" fill="none" stroke="#fff" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="32" cy="32" r="22"/><circle cx="32" cy="32" r="11"/>
    <circle cx="32" cy="32" r="2.5" fill="#fff" stroke="none"/>
  </svg>`;
const iconReview = `
  <svg viewBox="0 0 64 64" fill="none" stroke="#fff" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M52 32a20 20 0 1 1-6-14.2"/><path d="M52 10v10H42"/>
  </svg>`;
const iconSpeaker = `
  <svg viewBox="0 0 64 64" fill="none" stroke="${INK}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M14 26v12h10l12 10V16L24 26H14z" fill="${INK}"/>
    <path d="M44 24a12 12 0 0 1 0 16"/><path d="M50 18a20 20 0 0 1 0 28"/>
  </svg>`;

const FEATURES = [
  { icon: iconViewfinder, title: 'Point & learn', desc: 'Camera turns objects into words' },
  { icon: iconQuest, title: 'Daily quests', desc: 'Habit that keeps users coming back' },
  { icon: iconReview, title: 'Smart review', desc: 'Spaced repetition locks words in' },
];

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${W}px;height:${H}px}
body{position:relative;overflow:hidden;background:#000;
  font-family:-apple-system,"SF Pro Display","Helvetica Neue",system-ui,sans-serif;
  -webkit-font-smoothing:antialiased;color:#fff}

/* Фон: чёрный хедер плавно перетекает в графит, к низу чуть светлее */
.bg{position:absolute;inset:0;
  background:linear-gradient(180deg,#000 0%,#000 9%,#131316 22%,${INK} 40%,${INK} 100%)}
.glow{position:absolute;left:50%;top:2300px;width:2600px;height:2600px;transform:translateX(-50%);
  background:radial-gradient(circle,rgba(255,255,255,.075) 0%,rgba(255,255,255,0) 58%)}

/* Кикер слева сверху — балансирует vote here справа */
.kicker{position:absolute;left:150px;top:330px;display:flex;align-items:center;gap:22px;
  border:3px solid rgba(255,255,255,.35);border-radius:999px;padding:22px 44px;
  font-size:44px;font-weight:700;letter-spacing:8px;color:rgba(255,255,255,.82)}

/* Бренд-блок */
.wordmark{position:absolute;left:50%;top:640px;transform:translateX(-50%);width:1300px}
.tagline{position:absolute;left:50%;top:960px;transform:translateX(-50%);width:1760px;
  text-align:center;font-size:78px;line-height:1.28;font-weight:600;color:#E9E9EE}

/* Телефон + визирные скобки вокруг */
.stage{position:absolute;left:50%;top:1440px;transform:translateX(-50%);
  width:${SCREEN_W + BEZEL * 2}px}
.phone{position:relative;border-radius:96px;background:#0B0C0E;padding:${BEZEL}px;
  box-shadow:0 90px 160px -40px rgba(0,0,0,.85),0 30px 60px rgba(0,0,0,.5),
    0 0 0 2px rgba(255,255,255,.09);z-index:5}
.screen{width:${SCREEN_W}px;height:${SCREEN_H}px;border-radius:80px;overflow:hidden;position:relative}
.screen img{position:absolute;left:0;top:${-Math.round((SHOT_CROP_TOP * SCREEN_W) / SHOT_W)}px;
  width:${SCREEN_W}px}
.island{position:absolute;left:50%;top:${BEZEL + 26}px;transform:translateX(-50%);
  width:260px;height:64px;border-radius:999px;background:#0B0C0E;z-index:6}

.brk{position:absolute;width:190px;height:190px;border:14px solid rgba(255,255,255,.5);z-index:1}
.brk.tl{left:-150px;top:-130px;border-right:0;border-bottom:0;border-radius:44px 0 0 0}
.brk.tr{right:-150px;top:-130px;border-left:0;border-bottom:0;border-radius:0 44px 0 0}
.brk.bl{left:-150px;bottom:-130px;border-right:0;border-top:0;border-radius:0 0 0 44px}
.brk.br{right:-150px;bottom:-130px;border-left:0;border-top:0;border-radius:0 0 44px 0}

/* Карточка пойманного слова */
.card{position:absolute;right:-235px;bottom:280px;z-index:7;transform:rotate(-5deg);
  background:#fff;border-radius:40px;padding:44px 52px;color:${INK};
  box-shadow:0 50px 90px -20px rgba(0,0,0,.75)}
.card .w{display:flex;align-items:center;gap:26px;font-size:84px;font-weight:800;letter-spacing:-1px}
.card .w svg{width:64px;height:64px}
.card .tr2{margin-top:10px;font-size:52px;font-weight:600;color:#7c7c85}

/* Фичи */
.features{position:absolute;left:50%;top:3640px;transform:translateX(-50%);width:1800px;
  display:flex;flex-direction:column;gap:72px}
.feat{display:flex;align-items:center;gap:56px}
.feat .ic{flex:0 0 148px;height:148px;border-radius:44px;background:rgba(255,255,255,.08);
  border:3px solid rgba(255,255,255,.16);display:flex;align-items:center;justify-content:center}
.feat .ic svg{width:82px;height:82px}
.feat .tt{font-size:88px;font-weight:800;letter-spacing:-1px;line-height:1.05}
.feat .dd{margin-top:12px;font-size:58px;font-weight:500;color:${MUT}}

/* Трекшн */
.traction{position:absolute;left:50%;top:4415px;transform:translateX(-50%);white-space:nowrap;
  font-size:44px;font-weight:700;letter-spacing:4px;color:#8E8E96}
.traction b{color:#fff}

/* CTA-плита с QR */
.cta{position:absolute;left:0;right:0;bottom:0;height:560px;background:#fff;
  border-radius:72px 72px 0 0;display:flex;align-items:center;justify-content:center;gap:96px;
  color:${INK}}
.qr{width:400px;height:400px;border-radius:36px;border:6px solid ${INK};padding:16px}
.qr img{width:100%;height:100%}
.cta .txt .h{font-size:104px;font-weight:900;letter-spacing:-2px;line-height:1}
.cta .txt .s{margin-top:26px;font-size:54px;font-weight:600;color:#5b5b63}
.cta .txt .u{display:inline-block;margin-top:30px;background:${INK};color:#fff;
  border-radius:999px;padding:22px 54px;font-size:54px;font-weight:800;letter-spacing:1px}
.cta .txt .ios{margin-top:24px;font-size:40px;font-weight:600;color:#9a9aa2}
</style></head><body>
  <div class="bg"></div>
  <div class="glow"></div>

  <div class="kicker">LEARN A LANGUAGE WITH YOUR CAMERA</div>

  <img class="wordmark" src="${WORDMARK}">
  <div class="tagline">Point your camera at any object —<br>AI turns it into a word you’ll remember.</div>

  <div class="stage">
    <div class="brk tl"></div><div class="brk tr"></div>
    <div class="brk bl"></div><div class="brk br"></div>
    <div class="island"></div>
    <div class="phone">
      <div class="screen"><img src="${CAMERA}"></div>
    </div>
    <div class="card">
      <div class="w">${iconSpeaker}plant</div>
      <div class="tr2">растение&nbsp;&nbsp;·&nbsp;&nbsp;caught just now</div>
    </div>
  </div>

  <div class="features">
    ${FEATURES.map(
      (x) => `<div class="feat">
        <div class="ic">${x.icon}</div>
        <div><div class="tt">${x.title}</div><div class="dd">${x.desc}</div></div>
      </div>`,
    ).join('')}
  </div>

  <div class="traction"><b>150+ USERS</b> IN THE FIRST WEEKS&nbsp;&nbsp;—&nbsp;&nbsp;BEFORE THE APP STORE LAUNCH</div>

  <div class="cta">
    <div class="qr"><img src="${QR}"></div>
    <div class="txt">
      <div class="h">Try it now</div>
      <div class="s">Scan — the live demo runs in your browser</div>
      <div class="u">catch-words.com</div>
      <div class="ios">iOS app — coming soon to the App Store</div>
    </div>
  </div>
</body></html>`;

(async () => {
  const out = path.join(__dirname, 'out');
  fs.mkdirSync(out, { recursive: true });
  const htmlPath = path.join(out, 'banner-k1.html');
  fs.writeFileSync(htmlPath, html);

  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: W, height: H },
    deviceScaleFactor: 1,
  });
  await page.goto('file://' + htmlPath);
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(out, 'banner-k1.png') });
  await browser.close();
  console.log('OK → banner/out/banner-k1.png (' + W + '×' + H + ')');
})();
