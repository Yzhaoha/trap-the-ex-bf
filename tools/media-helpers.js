// Helpers for remaking the CrazyGames covers and preview videos.
// Paste into the browser console on index.html?debug&lang=en (served over http; ?debug exposes window.__game).
// They need a small local server that saves POST bodies:
//   POST /<name>.png                 -> the cover file
//   POST /frames/<video>/<00000>.jpg -> numbered video frames
// Encode the frames to MP4 at 60 fps, for example: ffmpeg -framerate 60 -i %05d.jpg -c:v libx264 -pix_fmt yuv420p -an out.mp4
// CrazyGames wants covers of 1920x1080, 800x1200 and 800x800, and videos of 1920x1080 and 1080x1620,
// 15-20 s, no sound, opening on the cover.
window.__manual = true; // stop the game loop; frames are stepped by hand
window.g = __game(); window.G = g.geo;
// Framing is measured from the floor, so it works whatever the window size.
window.TOP = G.FLOOR - 212; window.BOT = G.FLOOR + 42; window.SPAN = BOT - TOP;
const tx = (i) => G.T0 + G.TS * i + G.TS / 2;

// Fixed cover scene: one ex caught by each kind of trap.
window.__scene = () => {
  g.dbgBegin('level', 0); const S = g.debug();
  S.traps = []; S.heroes = []; S.balls = []; S.tut = null; S.phase = 'wave'; S.pops = []; S.talk = null;
  [['spike', 2], ['pit', 3], ['arrow', 4], ['chest', 5], ['flame', 7], ['spring', 8], ['ceil', 8], ['rock', 9]].forEach(([t, i]) => g.place(t, i));
  S.traps.forEach((t) => { t.arm = 0; });
  S.traps.find((t) => t.type === 'pit').open = true;
  g.flame(S.traps.find((t) => t.type === 'flame'), true);
  S.traps.find((t) => t.type === 'rock').rockY = G.FLOOR - 110;
  const sp = (c, x, o) => { g.spawn({ cls: c }); const h = S.heroes[S.heroes.length - 1]; h.x = x; Object.assign(h, o || {}); return h; };
  sp('rookie', tx(1) + 12, { run: 10 }); sp('scout', tx(2), { dead: true, deadT: 0.25 });
  sp('thief', tx(3), { fall: true, y: G.FLOOR + 30 }); sp('knight', tx(4) + 30, { run: 20 });
  sp('brute', tx(6) - 14, { wait: 1 }); sp('priest', tx(7), { dead: true, deadT: 0.15 });
  sp('sapper', tx(8), { y: G.WCEIL + 70, air: true }); sp('boss', tx(9) + 26, { run: 5 });
  S.arrows = [{ x: tx(4) - 2, y: G.FLOOR - 40 }];
};
// Renders the current world into a Wd x Ht canvas at scale s centred on world x = cx, with the title lines on top.
window.__cover2 = (Wd, Ht, s, cx, lines, tsize, ty) => {
  const cv = document.createElement('canvas'); cv.width = Wd; cv.height = Ht; const c = cv.getContext('2d');
  c.fillStyle = '#d886bc'; c.fillRect(0, 0, Wd, Ht);
  const worldH = Ht / s, worldW = Wd / s; g.renderWorld(c, s, cx - worldW / 2, BOT - worldH); c.setTransform(1, 0, 0, 1, 0, 0);
  lines.forEach((l, i) => g.txtO(c, l, Wd / 2, ty + i * tsize * 1.05, tsize, '#ffd250', 'center', 900, tsize * 0.2, '#2a1838'));
  return cv;
};
window.__up = (cv, name) => new Promise((r) => cv.toBlob((b) => fetch('http://127.0.0.1:8131/' + name, { method: 'POST', body: b }).then((x) => x.text()).then(r), 'image/png'));
// Covers:
//   __scene();
//   __up(__cover2(1920,1080,1080/SPAN,G.WW/2,['Trap the Ex BF'],160,120),'trap-the-ex-bf_landscape_1920x1080.png');
//   __up(__cover2(800,1200,1200/SPAN,G.T0+G.TS*5.6,['Trap the','Ex BF'],118,110),'trap-the-ex-bf_portrait_800x1200.png');
//   __up(__cover2(800,800,800/SPAN,G.T0+G.TS*5.2,['Trap the Ex BF'],86,80),'trap-the-ex-bf_square_800x800.png');

// Live gameplay for the videos: a steady stream of exes into a full row of traps that never break.
const MIX = ['rookie', 'knight', 'thief', 'rookie', 'brute', 'scout', 'priest', 'sapper', 'rookie', 'thief', 'knight', 'brute']; let k = 0;
window.__feed = (S) => { S.lives = 999; for (const t of S.traps) t.uses = Math.max(t.uses, 2); if (S.queue.length < 2) S.queue.push({ cls: MIX[k++ % MIX.length] }); S.spawnT = Math.min(S.spawnT, 0.8); S.phase = 'wave'; };
window.__live = () => {
  g.dbgBegin('level', 0); const S = g.debug(); S.tut = null; S.traps = []; S.heroes = []; S.lives = 999; S.gold = 999;
  [['spike', 1], ['arrow', 2], ['pit', 3], ['chest', 4], ['flame', 5], ['spring', 6], ['ceil', 6], ['spike', 7], ['rock', 8], ['ice', 9]].forEach(([t, i]) => g.place(t, i));
  S.traps.forEach((t) => { t.arm = 0; }); S.phase = 'wave'; S.wave = 3; S.spawnT = 0.2; S.queue = [];
  for (let i = 0; i < 300; i++) { __feed(S); g.update(1 / 60); } // start with the hallway already busy
  return S;
};
// toDataURL is synchronous; toBlob callbacks get throttled when the window is in the background.
window.toBlob = (cv) => { const d = atob(cv.toDataURL('image/jpeg', 0.93).split(',')[1]); const u = new Uint8Array(d.length); for (let i = 0; i < d.length; i++) u[i] = d.charCodeAt(i); return new Blob([u], { type: 'image/jpeg' }); };
// Steps the game at exactly 60 fps (independent of real time) and uploads every frame.
// The first 1.6 s are the cover; it fades into gameplay by 2.0 s. Portrait pans the camera along the hallway.
window.__frames = async (Wd, Ht, secs, name, portrait) => {
  const FPS = 60, N = Math.round(secs * FPS); const cv = document.createElement('canvas'); cv.width = Wd; cv.height = Ht; const c = cv.getContext('2d');
  const s = Ht / SPAN, worldW = Wd / s, worldH = Ht / s; __scene();
  const cover = portrait ? __cover2(Wd, Ht, s, G.T0 + G.TS * 5.6, ['Trap the', 'Ex BF'], Ht * 0.098, Ht * 0.092) : __cover2(Wd, Ht, s, G.WW / 2, ['Trap the Ex BF'], 160, 120);
  let S = null; const pend = [];
  for (let i = 0; i < N; i++) {
    const el = i / FPS, dt = 1 / FPS;
    if (el < 1.6) { c.setTransform(1, 0, 0, 1, 0, 0); c.drawImage(cover, 0, 0); } else {
      if (!S) S = __live(); __feed(S); g.update(dt);
      let ox;
      if (portrait) { const lo = worldW / 2, hi = G.WW - worldW / 2, u = (el - 1.6) / (secs - 1.6); ox = lo + (hi - lo) * (0.5 - 0.5 * Math.cos(Math.PI * 2 * u * 0.9 + Math.PI * 0.35)) - worldW / 2; } else ox = G.WW / 2 - worldW / 2;
      c.setTransform(1, 0, 0, 1, 0, 0); c.fillStyle = '#d886bc'; c.fillRect(0, 0, Wd, Ht); g.renderWorld(c, s, ox, BOT - worldH); c.setTransform(1, 0, 0, 1, 0, 0);
      if (el < 2.0) { c.globalAlpha = 1 - (el - 1.6) / 0.4; c.drawImage(cover, 0, 0); c.globalAlpha = 1; }
    }
    pend.push(fetch('http://127.0.0.1:8131/frames/' + name + '/' + String(i).padStart(5, '0') + '.jpg', { method: 'POST', body: toBlob(cv) }));
    if (pend.length >= 24) { await Promise.all(pend); pend.length = 0; }
  }
  await Promise.all(pend); return N;
};
// Videos:
//   await __frames(1920,1080,17.5,'landscape',false); await __frames(1080,1620,17.5,'portrait',true);
