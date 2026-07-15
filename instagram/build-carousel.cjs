/* Инстаграм-карусели TakeWord (1080×1350, 4:5).
 * Стиль вдохновлён Zimran (дерзко: ч/б фото, угловатые фигуры, крупный шрифт,
 * плашки-заголовки), но НЕ копия: наш синий #208AEF + фирменная рамка-визир
 * (как прицел сканера в аппке) + вордмарк TakeWord.
 *
 * Пост 1 «What is TakeWord?» — 6 слайдов (обложка + 4 фичи + CTA), со скринами.
 * Пост 2 «Who makes TakeWord» — 3 слайда на фото Алмаза (ч/б).
 * Пост 3 «Waiting for App Store approval» — 1 слайд-мем в фирменной рамке.
 *
 * Собрать всё: node instagram/build-carousel.cjs
 * Только один пост: node instagram/build-carousel.cjs post3
 */
const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SHOTS = path.join(ROOT, 'screen', 'shots');
const ME = path.join(__dirname, 'me');
const f = (p) => 'file://' + p;
const ICON = f(path.join(ROOT, 'assets', 'images', 'icon.png'));
const shot = (n) => f(path.join(SHOTS, n));
const me = (n) => f(path.join(ME, n));

const BLUE = '#208AEF';
const INK = '#0A1830';

// ---- Пост 1: What is TakeWord? ----
const POST1 = [
  { type: 'cover', kicker: 'swipe to see →',
    h1: 'WHAT IS', h2: 'TakeWord?',
    sub: 'the app that turns real life<br>into vocabulary — through your camera' },
  { type: 'feature', n: 1, tag: 'point',
    h: 'Point at<br><em>anything.</em>',
    sub: 'See an object in real life? Just aim your camera at it.',
    shot: '0.jpg' },
  { type: 'feature', n: 2, tag: 'catch',
    h: 'Get the word<br><em>instantly.</em>',
    sub: 'Name, translation, examples & a memory hook — in about a second.',
    shot: '9.jpg' },
  { type: 'feature', n: 3, tag: 'remember',
    h: 'Make it<br><em>stick.</em>',
    sub: 'Smart daily reviews move new words into long-term memory.',
    shot: '5.jpg' },
  { type: 'feature', n: 4, tag: 'collect',
    h: 'Your world<br>becomes your<br><em>vocabulary.</em>',
    sub: 'Every word you catch, collected in one place.',
    shot: '8.jpg' },
  { type: 'cta',
    h1: 'Learn a language', h2: 'by <em>living it.</em>',
    sub: 'TakeWord — on iOS',
    url: 'catch-words.com' },
];

// ---- Пост 2: Who makes TakeWord (оригиналы p1/p2/p3 — chromium рендерит ровно) ----
const POST2 = [
  { type: 'photo', img: 'p1.jpg', pos: '50% 40%',
    block: 'dark',
    kicker: 'the story',
    h1: 'WHO MAKES', h2: 'TakeWord?', sub: '' },
  { type: 'photo', img: 'p2.jpg', pos: '50% 46%',
    block: 'blue',
    kicker: '', h1: 'Almaz', h2: 'Bukayev',
    sub: 'Founder · from Kostanay 🇰🇿',
    pill: 'nFactorial incubator 2026' },
  { type: 'photo', img: 'p3.jpg', pos: '50% 40%',
    block: 'dark',
    kicker: 'the mission',
    h1: 'One founder,', h2: 'building in <em>public.</em>',
    sub: 'Turning the camera into the fastest,<br>most fun way to learn a language.',
    pill: 'catch-words.com' },
];

// ---- Пост 3: мем «Waiting for App Store approval» ----
// У исходника сверху белая плашка с подписью (первые 176px из 1350) — режем её
// и подставляем свой заголовок; сетка кадров под ней 1080×1174.
const POST3 = [
  { type: 'meme', img: 'waiting.png', band: 176,
    tag: 'in review',
    h1: 'Waiting for', h2: 'App Store approval.',
    url: 'catch-words.com' },
];

const BASE = `
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:1080px;height:1350px}
body{position:relative;overflow:hidden;
  font-family:-apple-system,"SF Pro Display","Helvetica Neue",system-ui,sans-serif;
  color:#fff;-webkit-font-smoothing:antialiased}
em{font-style:normal;font-family:"Avenir Next Condensed","SF Pro Display",sans-serif}
/* верхняя строка: лого + счётчик */
.top{position:absolute;top:60px;left:64px;right:64px;display:flex;align-items:center;
  justify-content:space-between;z-index:9}
.brand{display:flex;align-items:center;gap:16px}
.brand img{width:58px;height:58px;border-radius:15px;box-shadow:0 6px 18px rgba(0,0,0,.28)}
.brand b{font-size:33px;font-weight:800;letter-spacing:-.6px}
.count{font-size:26px;font-weight:800;letter-spacing:.5px;padding:9px 20px;border-radius:999px;
  background:rgba(255,255,255,.16);backdrop-filter:blur(6px)}
/* рамка-визир (прицел сканера) */
.reticle{position:absolute;pointer-events:none}
.reticle span{position:absolute;width:74px;height:74px;border:7px solid #fff}
.reticle .tl{top:0;left:0;border-right:0;border-bottom:0;border-radius:22px 0 0 0}
.reticle .tr{top:0;right:0;border-left:0;border-bottom:0;border-radius:0 22px 0 0}
.reticle .bl{bottom:0;left:0;border-right:0;border-top:0;border-radius:0 0 0 22px}
.reticle .br{bottom:0;right:0;border-left:0;border-top:0;border-radius:0 0 22px 0}
/* тайловый водяной знак */
.wm{position:absolute;inset:-40% -10%;transform:rotate(-8deg);opacity:.07;z-index:0;
  font-weight:900;font-size:120px;line-height:1.1;letter-spacing:-2px;
  white-space:nowrap;overflow:hidden;color:#fff}
.wm div{overflow:hidden;text-overflow:clip}
/* диагональный «шов» перехода между слайдами (цвет соседнего слайда в углу) */
.tseam{position:absolute;inset:0;z-index:1;pointer-events:none}
`;

function chrome(idx, total, dark) {
  const c = dark ? '#0E1116' : '#fff';
  return `<div class="top" style="color:${c}">
    <div class="brand"><img src="${ICON}"><b>TakeWord</b></div>
    <div class="count" style="${dark ? 'background:rgba(0,0,0,.10);color:#0E1116' : ''}">${idx}/${total}</div>
  </div>`;
}
const wm = () => `<div class="wm">${Array.from({ length: 12 }).map(() =>
  '<div>take word · take word · take word · take word</div>').join('')}</div>`;

function phone(src, cls = '') {
  return `<div class="phone ${cls}"><div class="notch"></div><img src="${shot(src)}"></div>`;
}

// Летающие 3D-карточки слов (обложка): слово + транскрипция + перевод.
// Часть карточек «перевёрнута» (rotate 180 / обратная сторона с визиром).
function wcard(o) {
  if (o.back) return `<div class="wc back" style="${o.s}">
    <span class="tl"></span><span class="tr"></span><span class="bl"></span><span class="br"></span>
    <div class="bmark">TakeWord</div></div>`;
  return `<div class="wc ${o.cls || ''}" style="${o.s}">
    <div class="wtop"><span class="ww">${o.w}</span><span class="wipa">${o.ipa || ''}</span></div>
    <div class="wt">${o.t}</div></div>`;
}

function cover(s, idx, total) {
  const cards = [
    // «в глубине» — мельче и затемнённые, заполняют правый борт
    wcard({ w: 'taza', ipa: "/'tasa/", t: 'cup', cls: 'dim sm',
      s: 'left:812px;top:158px;transform:rotateY(-24deg) rotateZ(-5deg) translateZ(-150px)' }),
    wcard({ w: 'libro', ipa: "/'liβɾo/", t: 'book', cls: 'dim sm',
      s: 'left:806px;top:592px;transform:rotateY(-22deg) rotateZ(6deg) translateZ(-120px)' }),
    // передний план — диагональ botella → planta → ventana
    wcard({ w: 'botella', ipa: "/bo'tela/", t: 'bottle', cls: '',
      s: 'left:110px;top:664px;transform:rotateY(15deg) rotateZ(6deg) translateZ(10px)' }),
    wcard({ w: 'planta', ipa: "/'planta/", t: 'plant', cls: 'hero',
      s: 'left:470px;top:760px;transform:rotateY(-15deg) rotateZ(-5deg) translateZ(80px)' }),
    wcard({ w: 'ventana', ipa: "/ben'tana/", t: 'window', cls: '',
      s: 'left:690px;top:1010px;transform:rotateY(-16deg) rotateZ(9deg) translateZ(20px)' }),
  ].join('');
  return `<body style="background:${BLUE}">
  ${wm()}
  <div class="shard s1"></div>
  <div class="cards">${cards}</div>
  <div class="cover-head">
    <div class="kicker">${s.kicker}</div>
    <div class="cover-title"><span class="l1">${s.h1}</span><span class="l2"><em>${s.h2}</em></span></div>
    <div class="cover-sub">${s.sub}</div>
  </div>
  <style>
    .shard{position:absolute;z-index:0}
    .s1{top:-120px;right:-180px;width:720px;height:720px;background:rgba(255,255,255,.10);
      clip-path:polygon(38% 0,100% 22%,100% 100%,0 78%)}
    .cover-head{position:absolute;top:104px;left:64px;right:64px;z-index:6}
    .kicker{font-size:27px;font-weight:800;letter-spacing:1.5px;opacity:.92;margin-bottom:20px;text-transform:uppercase}
    .cover-title{display:flex;flex-direction:column;line-height:.88}
    .cover-title .l1{font-size:82px;font-weight:900;letter-spacing:-1.6px}
    .cover-title .l2{font-size:126px;font-weight:900;letter-spacing:-3px;margin-top:2px}
    .cover-title em{font-family:"Avenir Next Condensed";font-style:italic;font-weight:800}
    .cover-sub{margin-top:22px;font-size:31px;font-weight:600;line-height:1.3;opacity:.95;max-width:840px}
    /* сцена 3D-карточек */
    .cards{position:absolute;inset:0;z-index:3;perspective:1500px;transform-style:preserve-3d}
    .wc{position:absolute;width:300px;background:#fff;border-radius:30px;padding:28px 32px;
      border:1px solid rgba(10,24,48,.06);
      box-shadow:0 48px 80px -24px rgba(4,16,40,.6),0 14px 30px rgba(4,16,40,.32);
      color:${INK};transform-style:preserve-3d}
    .wc .wtop{display:flex;align-items:baseline;gap:12px;flex-wrap:wrap}
    .wc .ww{font-size:50px;font-weight:900;letter-spacing:-1.4px;line-height:1}
    .wc .wipa{font-size:23px;font-weight:600;color:#8A93A3}
    .wc .wt{margin-top:14px;padding-top:14px;font-size:33px;font-weight:800;color:${BLUE};
      border-top:2px solid rgba(10,24,48,.07);display:flex;align-items:center;gap:12px}
    .wc .wt::before{content:"";width:14px;height:14px;border-radius:50%;background:${BLUE};flex:none}
    .wc.hero{width:342px}
    .wc.hero .ww{font-size:58px}
    .wc.hero .wt{font-size:37px}
    .wc.sm{width:250px;padding:22px 26px}
    .wc.sm .ww{font-size:40px}
    .wc.sm .wt{font-size:27px;margin-top:10px;padding-top:10px}
    .wc.sm .wt::before{width:11px;height:11px}
    .wc.dim{opacity:.9}
    .wc.back{background:${BLUE};min-height:158px;border:3px solid rgba(255,255,255,.55);
      display:flex;align-items:center;justify-content:center}
    .wc.back span{position:absolute;width:40px;height:40px;border:6px solid rgba(255,255,255,.92)}
    .wc.back .tl{top:18px;left:18px;border-right:0;border-bottom:0;border-radius:14px 0 0 0}
    .wc.back .tr{top:18px;right:18px;border-left:0;border-bottom:0;border-radius:0 14px 0 0}
    .wc.back .bl{bottom:18px;left:18px;border-right:0;border-top:0;border-radius:0 0 0 14px}
    .wc.back .br{bottom:18px;right:18px;border-left:0;border-top:0;border-radius:0 0 14px 0}
    .wc.back .bmark{font-size:30px;font-weight:900;color:#fff;letter-spacing:-.5px}
  </style></body>`;
}

function feature(s, idx, total) {
  const bg = s.n % 2 === 0 ? INK : BLUE;
  return `<body style="background:${bg}">
  ${wm()}
  <div class="shard fs"></div>
  <div class="feat-head">
    <div class="feat-tag">${s.tag}</div>
    <h1>${s.h}</h1>
    <div class="feat-sub">${s.sub}</div>
  </div>
  <div class="feat-stage">
    ${phone(s.shot)}
  </div>
  <style>
    .shard{position:absolute;z-index:0}
    .fs{top:-160px;left:-180px;width:720px;height:720px;background:rgba(255,255,255,.07);
      clip-path:polygon(0 0,100% 26%,64% 100%,0 70%)}
    .feat-head{position:absolute;top:110px;left:64px;right:64px;z-index:5}
    .feat-tag{display:inline-block;font-size:26px;font-weight:900;letter-spacing:2px;text-transform:uppercase;
      color:${bg === BLUE ? INK : BLUE};background:#fff;padding:8px 20px;border-radius:10px;margin-bottom:22px}
    h1{font-size:88px;font-weight:900;line-height:.94;letter-spacing:-2.4px}
    h1 em{font-family:"Avenir Next Condensed";font-style:italic;font-weight:800;color:#fff}
    .feat-sub{margin-top:24px;font-size:32px;font-weight:600;line-height:1.32;opacity:.95;max-width:860px}
    .feat-stage{position:absolute;left:0;right:0;top:496px;display:flex;align-items:flex-start;justify-content:center;z-index:4}
    /* весь телефон целиком в кадре (экран видно полностью) */
    .feat-stage .phone{transform:scale(.735);transform-origin:top center}
    .rt{width:660px;height:600px;top:0}
    .feat-stage .reticle{position:absolute}
  </style></body>`;
}

function cta(s, idx, total) {
  return `<body style="background:${INK}">
  ${wm()}
  <div class="shard c1"></div><div class="shard c2"></div>
  <div class="reticle" style="left:110px;right:110px;top:360px;bottom:360px">
    <span class="tl"></span><span class="tr"></span><span class="bl"></span><span class="br"></span></div>
  <div class="cta-wrap">
    <div class="cta-h"><span>${s.h1}</span><span><em>${s.h2.replace(/<\/?em>/g,'')}</em></span></div>
    <div class="appstore">
      <svg class="apple" viewBox="0 0 24 24"><path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.51 4.09l-.02-.01M12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25"/></svg>
      <div class="as-txt"><span class="as-small">Coming soon on the</span><span class="as-big">App&nbsp;Store</span></div>
    </div>
    <div class="cta-site">${s.url}</div>
  </div>
  <style>
    .shard{position:absolute;z-index:0}
    .c1{top:-140px;right:-160px;width:680px;height:680px;background:${BLUE};opacity:.9;
      clip-path:polygon(40% 0,100% 30%,100% 100%,0 66%)}
    .c2{bottom:-160px;left:-180px;width:560px;height:560px;background:${BLUE};opacity:.24;
      clip-path:polygon(0 30%,70% 0,100% 100%,16% 100%)}
    .cta-wrap{position:absolute;left:64px;right:64px;top:50%;transform:translateY(-50%);text-align:center;z-index:5}
    .cta-h{display:flex;flex-direction:column;line-height:.94}
    .cta-h span:first-child{font-size:74px;font-weight:800;letter-spacing:-1.6px}
    .cta-h span:last-child{font-size:118px;font-weight:900;letter-spacing:-3px}
    .cta-h em{font-family:"Avenir Next Condensed";font-style:italic;font-weight:800;color:${BLUE};
      -webkit-text-stroke:0;text-shadow:0 0 1px ${BLUE}}
    .appstore{margin-top:46px;display:inline-flex;align-items:center;gap:20px;
      background:#000;padding:22px 46px;border-radius:24px;
      box-shadow:0 26px 60px -18px rgba(0,0,0,.7)}
    .appstore .apple{width:54px;height:54px;fill:#fff;flex:none;margin-top:-4px}
    .as-txt{display:flex;flex-direction:column;line-height:1.02;text-align:left}
    .as-small{font-size:25px;font-weight:600;letter-spacing:.3px;color:#fff;opacity:.92}
    .as-big{font-size:46px;font-weight:700;letter-spacing:-.5px;color:#fff}
    .cta-site{margin-top:28px;font-size:29px;font-weight:700;opacity:.72;letter-spacing:.3px}
  </style></body>`;
}

function photo(s, idx, total) {
  const block = s.block === 'blue' ? BLUE : '#0E1116';
  const acc = s.block === 'blue' ? '#0E1116' : BLUE;
  return `<body style="background:#0E1116">
  <img class="bg" src="${me(s.img)}" style="object-position:${s.pos}">
  <div class="scrim"></div>
  <div class="shard ps"></div>
  <div class="wm">${Array.from({ length: 12 }).map(() =>
    '<div>take word · take word · take word · take word</div>').join('')}</div>
  ${chrome(idx, total, false)}
  <div class="reticle" style="left:56px;right:56px;top:150px;bottom:150px">
    <span class="tl"></span><span class="tr"></span><span class="bl"></span><span class="br"></span></div>
  <div class="pblock">
    ${s.kicker ? `<div class="pkick">${s.kicker}</div>` : ''}
    <div class="ptitle"><span>${s.h1}</span><span class="acc"><em>${s.h2.replace(/<\/?em>/g,'')}</em></span></div>
    ${s.sub ? `<div class="psub">${s.sub}</div>` : ''}
    ${s.pill ? `<div class="ppill">${s.pill}</div>` : ''}
  </div>
  <style>
    .bg{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;
      filter:grayscale(1) contrast(1.08) brightness(1.02);z-index:0}
    .scrim{position:absolute;inset:0;z-index:1;
      background:linear-gradient(180deg,rgba(0,0,0,.42) 0%,rgba(0,0,0,0) 26%,rgba(0,0,0,0) 44%,rgba(0,0,0,.86) 100%)}
    .ps{position:absolute;z-index:2;bottom:0;left:0;width:520px;height:520px;background:${BLUE};opacity:.16;
      clip-path:polygon(0 40%,64% 0,100% 100%,0 100%)}
    .pblock{position:absolute;left:56px;right:56px;bottom:92px;z-index:6}
    .pkick{font-size:26px;font-weight:900;letter-spacing:2px;text-transform:uppercase;opacity:.9;margin-bottom:18px}
    .ptitle{display:flex;flex-direction:column;line-height:.88}
    .ptitle span{font-size:112px;font-weight:900;letter-spacing:-3px}
    .ptitle .acc em{font-family:"Avenir Next Condensed";font-style:italic;font-weight:800;color:${BLUE}}
    .psub{margin-top:24px;font-size:34px;font-weight:700;line-height:1.28;max-width:900px}
    .ppill{margin-top:26px;display:inline-block;font-size:28px;font-weight:900;letter-spacing:.3px;
      background:${block};color:${s.block==='blue'?'#fff':'#fff'};padding:13px 30px;border-radius:999px}
  </style></body>`;
}

function meme(s) {
  const CARD_W = 900;
  const SRC_W = 1080, SRC_H = 1350;
  const k = CARD_W / SRC_W;                       // масштаб исходника в карточке
  const cardH = Math.round((SRC_H - s.band) * k); // высота без белой плашки
  const shift = Math.round(s.band * k);
  return `<body style="background:${INK}">
  ${wm()}
  <div class="shard m1"></div><div class="shard m2"></div>
  <div class="top">
    <div class="brand"><img src="${ICON}"><b>TakeWord</b></div>
    <div class="count mtag">${s.tag}</div>
  </div>
  <div class="mtitle">
    <span>${s.h1}</span><span class="acc"><em>${s.h2}</em></span>
  </div>
  <div class="mcard"><img src="${me(s.img)}"></div>
  <div class="reticle" style="left:66px;right:66px;top:264px;bottom:60px">
    <span class="tl"></span><span class="tr"></span><span class="bl"></span><span class="br"></span></div>
  <div class="msite">${s.url}</div>
  <style>
    /* синие фигуры держим ПОДАЛЬШЕ от синего заголовка: яркая — за карточкой,
       верхняя — только фоновый намёк, иначе текст сливается с фоном */
    .shard{position:absolute;z-index:0}
    .m1{bottom:-150px;right:-210px;width:600px;height:600px;background:${BLUE};opacity:.9;
      clip-path:polygon(40% 0,100% 28%,100% 100%,0 72%)}
    .m2{top:-190px;right:-210px;width:620px;height:620px;background:${BLUE};opacity:.14;
      clip-path:polygon(42% 0,100% 26%,100% 100%,0 70%)}
    .wm{opacity:.05}
    .top{top:52px}
    .mtag{text-transform:uppercase;letter-spacing:2px;font-size:24px;
      background:#fff;color:${INK};display:flex;align-items:center;gap:12px}
    .mtag::before{content:"";width:14px;height:14px;border-radius:50%;background:${BLUE}}
    .mtitle{position:absolute;left:90px;right:90px;top:122px;z-index:6;
      display:flex;flex-direction:column;line-height:.95}
    .mtitle span:first-child{font-size:72px;font-weight:900;letter-spacing:-1.8px}
    .mtitle .acc{font-size:76px;font-weight:900;letter-spacing:-2px}
    .mtitle .acc em{font-family:"Avenir Next Condensed";font-style:italic;font-weight:800;color:${BLUE}}
    .mcard{position:absolute;left:90px;top:288px;width:${CARD_W}px;height:${cardH}px;
      border-radius:34px;overflow:hidden;background:#fff;z-index:5;
      box-shadow:0 44px 90px -30px rgba(0,0,0,.72),0 12px 28px rgba(0,0,0,.35)}
    .mcard img{display:block;width:${CARD_W}px;margin-top:-${shift}px}
    .msite{position:absolute;left:0;right:0;bottom:20px;z-index:6;text-align:center;
      font-size:26px;font-weight:700;letter-spacing:.4px;opacity:.66}
  </style></body>`;
}

const PHONE_CSS = `
.phone{position:relative;width:520px;border-radius:52px;background:#0C0D10;padding:14px;
  box-shadow:0 46px 90px -26px rgba(0,0,0,.6),0 14px 30px rgba(0,0,0,.3);z-index:5}
.phone img{display:block;width:100%;border-radius:40px}
.notch{position:absolute;top:14px;left:50%;transform:translateX(-50%);
  width:186px;height:24px;background:#0C0D10;border-radius:0 0 14px 14px;z-index:2}
`;

// Цвет фона слайда — чтобы построить бесшовные переходы.
function bgColor(s) {
  if (s.type === 'cover') return BLUE;
  if (s.type === 'cta') return INK;
  if (s.type === 'feature') return s.n % 2 === 0 ? INK : BLUE;
  return '#0E1116';
}

// Диагональный шов: угол в цвете соседнего слайда. Правый-верхний → следующий,
// левый-нижний → предыдущий. Линия разреза совпадает по обе стороны стыка (склон 2),
// поэтому при свайпе два угла складываются в одну непрерывную диагональ.
function seamWedges(prev, cur, next) {
  let h = '';
  if (prev && prev !== cur)
    h += `<div class="tseam" style="background:${prev};clip-path:polygon(0 50%,0 100%,25% 100%)"></div>`;
  if (next && next !== cur)
    h += `<div class="tseam" style="background:${next};clip-path:polygon(75% 0,100% 0,100% 50%)"></div>`;
  return h;
}

function render(s, idx, total, seam) {
  let body;
  if (s.type === 'cover') body = cover(s, idx, total);
  else if (s.type === 'feature') body = feature(s, idx, total);
  else if (s.type === 'cta') body = cta(s, idx, total);
  else if (s.type === 'meme') body = meme(s);
  else body = photo(s, idx, total);
  if (seam) {
    const w = seamWedges(seam.prev, seam.cur, seam.next);
    if (w) body = body.replace(/(<body\b[^>]*>)/, `$1${w}`);
  }
  return `<!doctype html><html><head><meta charset="utf-8"><style>${BASE}${PHONE_CSS}</style></head>${body}</html>`;
}

(async () => {
  const only = process.argv[2];
  const posts = [['post1', POST1], ['post2', POST2], ['post3', POST3]]
    .filter(([name]) => !only || name === only);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1080, height: 1350 }, deviceScaleFactor: 2 });
  for (const [name, slides] of posts) {
    const outDir = path.join(__dirname, 'out', name);
    fs.mkdirSync(outDir, { recursive: true });
    const colors = slides.map(bgColor);
    for (let i = 0; i < slides.length; i++) {
      const seam = name === 'post1'
        ? { prev: colors[i - 1] || null, cur: colors[i], next: colors[i + 1] || null }
        : null;
      const htmlPath = path.join(outDir, `${String(i + 1).padStart(2, '0')}.html`);
      fs.writeFileSync(htmlPath, render(slides[i], i + 1, slides.length, seam));
      await page.goto('file://' + htmlPath);
      await page.waitForTimeout(120);
      await page.screenshot({ path: path.join(outDir, `${String(i + 1).padStart(2, '0')}.png`) });
      console.log('✓', name, i + 1);
    }
  }
  await browser.close();
})();
