'use strict';
// เอฟเฟกต์ภาพ — เลเยอร์ซ้อนทับหน้าจอ ไม่กระทบตรรกะเกม (ปิดได้ด้วยปุ่ม ✨ หรือเมื่อเครื่องตั้งค่าลดการเคลื่อนไหว)
const SGFX = (() => {
  const reduce = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const enabled = () => !window.SG_NOFX;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const root = () => { let d = document.getElementById('vfx'); if (!d) { d = document.createElement('div'); d.id = 'vfx'; document.body.appendChild(d); } return d; };
  const mk = (html, css, cls) => { const d = document.createElement('div'); d.className = 'vf ' + (cls || ''); d.innerHTML = html || ''; Object.assign(d.style, css || {}); root().appendChild(d); return d; };
  const go = (d, frames, opts) => { const a = d.animate(frames, Object.assign({ fill: 'forwards', easing: 'ease-out' }, opts)); a.onfinish = () => d.remove(); return a; };
  const seatEl = (env, seat) => (seat === env.you ? document.querySelector('.mehead') : document.querySelector(`.seat[data-seat="${seat}"]`));
  const pos = (env, seat) => { const e = seatEl(env, seat); if (!e) return { x: innerWidth / 2, y: innerHeight / 2, w: 120, h: 80 }; const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height }; };
  const mid = () => ({ x: innerWidth / 2, y: Math.min(innerHeight * 0.42, 340) });

  function shake(env, seat, amp = 9, ms = 450) {
    const e = seatEl(env, seat); if (!e) return;
    e.animate([{ transform: 'translateX(0)' }, { transform: `translateX(${-amp}px)` }, { transform: `translateX(${amp}px)` }, { transform: `translateX(${-amp * 0.6}px)` }, { transform: `translateX(${amp * 0.6}px)` }, { transform: 'translateX(0)' }], { duration: ms });
  }
  function shakeScreen(amp = 7, ms = 500) {
    const e = document.getElementById('app'); if (!e) return;
    e.animate([{ transform: 'translate(0,0)' }, { transform: `translate(${-amp}px,${amp / 2}px)` }, { transform: `translate(${amp}px,${-amp / 2}px)` }, { transform: `translate(${-amp / 2}px,${-amp}px)` }, { transform: `translate(${amp / 2}px,${amp}px)` }, { transform: 'translate(0,0)' }], { duration: ms });
  }
  function flash(color, peak = 0.45, ms = 500) { const d = mk('', { inset: 0, width: '100%', height: '100%', background: color }); go(d, [{ opacity: 0 }, { opacity: peak, offset: 0.2 }, { opacity: 0 }], { duration: ms }); }
  function banner(text, color = '#ffd24a', sub) {
    const d = mk(`<div class="bt" style="color:${color}">${text}</div>${sub ? `<div class="bs">${sub}</div>` : ''}`, { left: 0, width: '100%', top: '22%' }, 'bnr');
    go(d, [{ opacity: 0, transform: 'scale(.55)' }, { opacity: 1, transform: 'scale(1.08)', offset: 0.22 }, { opacity: 1, transform: 'scale(1)', offset: 0.7 }, { opacity: 0, transform: 'scale(1.04) translateY(-14px)' }], { duration: 1300 });
  }
  function label(env, seat, text, color) {
    const p = pos(env, seat); const d = mk(text, { left: p.x + 'px', top: p.y - p.h / 2 - 6 + 'px', color: color || '#ffd24a' }, 'lbl');
    go(d, [{ opacity: 0, transform: 'translate(-50%,6px) scale(.8)' }, { opacity: 1, transform: 'translate(-50%,-8px) scale(1)', offset: 0.25 }, { opacity: 1, transform: 'translate(-50%,-14px)', offset: 0.75 }, { opacity: 0, transform: 'translate(-50%,-26px)' }], { duration: 1500 });
  }
  function burst(x, y, emoji, n = 10, spread = 90, dur = 900, size = 22) {
    for (let i = 0; i < n; i++) {
      const a = rnd(0, Math.PI * 2), r = rnd(spread * 0.3, spread);
      const d = mk(Array.isArray(emoji) ? emoji[i % emoji.length] : emoji, { left: x + 'px', top: y + 'px', fontSize: rnd(size * 0.7, size * 1.3) + 'px' }, 'em');
      go(d, [{ opacity: 1, transform: 'translate(-50%,-50%) scale(.5)' }, { opacity: 1, transform: `translate(calc(-50% + ${Math.cos(a) * r}px), calc(-50% + ${Math.sin(a) * r}px)) scale(1)`, offset: 0.55 }, { opacity: 0, transform: `translate(calc(-50% + ${Math.cos(a) * r * 1.2}px), calc(-50% + ${Math.sin(a) * r * 1.2 + 20}px)) scale(.8)` }], { duration: dur + rnd(-150, 150) });
    }
  }
  function rise(x, y, emoji, n = 8, w = 90, dur = 1300, size = 22) {
    for (let i = 0; i < n; i++) {
      const d = mk(Array.isArray(emoji) ? emoji[i % emoji.length] : emoji, { left: x + rnd(-w, w) + 'px', top: y + rnd(0, 30) + 'px', fontSize: rnd(size * 0.8, size * 1.4) + 'px' }, 'em');
      go(d, [{ opacity: 0, transform: 'translate(-50%,0) scale(.6)' }, { opacity: 1, transform: `translate(-50%,-${rnd(30, 60)}px) scale(1)`, offset: 0.3 }, { opacity: 0, transform: `translate(-50%,-${rnd(100, 170)}px) scale(.9)` }], { duration: dur + rnd(-200, 300), delay: rnd(0, 350) });
    }
  }
  function rain(emoji, n = 24, dur = 1500, size = 26, dir = 1) {
    for (let i = 0; i < n; i++) {
      const x = rnd(0, innerWidth);
      const d = mk(Array.isArray(emoji) ? emoji[i % emoji.length] : emoji, { left: x + 'px', top: '-40px', fontSize: rnd(size * 0.7, size * 1.3) + 'px' }, 'em');
      go(d, [{ opacity: 0, transform: 'translate(-50%,0) rotate(0)' }, { opacity: 1, offset: 0.1 }, { opacity: 0.9, offset: 0.85 }, { opacity: 0, transform: `translate(calc(-50% + ${dir * rnd(-60, 120)}px), ${innerHeight + 60}px) rotate(${rnd(-200, 200)}deg)` }], { duration: dur + rnd(-300, 500), delay: rnd(0, 700), easing: 'ease-in' });
    }
  }
  function beam(from, to, emoji, dur = 520, size = 34, spin = 0) {
    const d = mk(emoji, { left: from.x + 'px', top: from.y + 'px', fontSize: size + 'px' }, 'em');
    go(d, [{ opacity: 0, transform: 'translate(-50%,-50%) scale(.6) rotate(0)' }, { opacity: 1, offset: 0.15 }, { opacity: 1, transform: `translate(calc(-50% + ${to.x - from.x}px), calc(-50% + ${to.y - from.y}px)) scale(1.1) rotate(${spin}deg)`, offset: 0.92 }, { opacity: 0, transform: `translate(calc(-50% + ${to.x - from.x}px), calc(-50% + ${to.y - from.y}px)) scale(1.4) rotate(${spin}deg)` }], { duration: dur, easing: 'ease-in' });
  }
  function ring(x, y, color, size = 120, dur = 700) {
    const d = mk('', { left: x + 'px', top: y + 'px', width: size + 'px', height: size + 'px', border: `4px solid ${color}`, borderRadius: '50%', boxShadow: `0 0 24px ${color}, inset 0 0 18px ${color}` });
    go(d, [{ opacity: 0.95, transform: 'translate(-50%,-50%) scale(.2)' }, { opacity: 0, transform: 'translate(-50%,-50%) scale(1.5)' }], { duration: dur });
  }
  function slash(a, b, color = '#ff5a3d') {
    const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy), ang = Math.atan2(dy, dx) * 180 / Math.PI;
    const d = mk('', { left: a.x + 'px', top: a.y - 4 + 'px', width: len + 'px', height: '8px', transformOrigin: '0 50%', background: `linear-gradient(90deg, transparent, #fff 55%, ${color})`, borderRadius: '4px', boxShadow: `0 0 12px ${color}` });
    go(d, [{ opacity: 1, transform: `rotate(${ang}deg) scaleX(0)` }, { opacity: 1, transform: `rotate(${ang}deg) scaleX(1)`, offset: 0.5 }, { opacity: 0, transform: `rotate(${ang}deg) scaleX(1)` }], { duration: 420 });
    setTimeout(() => {
      for (const r of [-38, 38]) { const m = mk('', { left: b.x + 'px', top: b.y + 'px', width: '110px', height: '7px', background: `linear-gradient(90deg, transparent, #fff, ${color}, transparent)`, borderRadius: '4px', boxShadow: `0 0 14px ${color}` }); go(m, [{ opacity: 1, transform: `translate(-50%,-50%) rotate(${r}deg) scaleX(.1)` }, { opacity: 1, transform: `translate(-50%,-50%) rotate(${r}deg) scaleX(1.1)`, offset: 0.35 }, { opacity: 0, transform: `translate(-50%,-50%) rotate(${r}deg) scaleX(1.2)` }], { duration: 460 }); }
      burst(b.x, b.y, ['✦', '✧', '•'], 8, 60, 500, 18);
    }, 330);
  }
  function arrowVolley(n = 34) {
    for (let i = 0; i < n; i++) {
      const sx = rnd(-100, innerWidth * 0.8), sy = rnd(-140, -20), len = rnd(70, 120);
      const d = mk('', { left: sx + 'px', top: sy + 'px', width: len + 'px', height: '3px', background: 'linear-gradient(90deg, transparent, #d9c9a0 60%, #fff)', transformOrigin: '0 50%' }, 'arrow');
      const ex = sx + rnd(260, 520), ey = innerHeight + 40;
      const ang = Math.atan2(ey - sy, ex - sx) * 180 / Math.PI;
      go(d, [{ opacity: 0, transform: `translate(0,0) rotate(${ang}deg)` }, { opacity: 1, offset: 0.1 }, { opacity: 1, transform: `translate(${ex - sx}px, ${ey - sy}px) rotate(${ang}deg)`, offset: 0.9 }, { opacity: 0, transform: `translate(${ex - sx}px, ${ey - sy}px) rotate(${ang}deg)` }], { duration: rnd(650, 950), delay: rnd(0, 600), easing: 'ease-in' });
    }
  }
  function fireWash() {
    const d = mk('', { left: 0, bottom: 0, top: 'auto', width: '100%', height: '65%', background: 'linear-gradient(to top, rgba(255,120,20,.85), rgba(255,60,0,.35) 45%, transparent)' });
    d.style.top = 'auto'; d.style.bottom = '0';
    go(d, [{ opacity: 0, transform: 'translateY(40%)' }, { opacity: 1, transform: 'translateY(0)', offset: 0.35 }, { opacity: 0, transform: 'translateY(-5%)' }], { duration: 1300 });
  }
  function dust(x, y, n = 12) { for (let i = 0; i < n; i++) { const d = mk('', { left: x + rnd(-40, 40) + 'px', top: y + rnd(10, 30) + 'px', width: rnd(14, 28) + 'px', height: rnd(14, 28) + 'px', borderRadius: '50%', background: 'rgba(200,170,120,.55)', filter: 'blur(3px)' }); go(d, [{ opacity: 0.8, transform: 'translate(-50%,-50%) scale(.4)' }, { opacity: 0, transform: `translate(calc(-50% + ${rnd(-90, 90)}px), calc(-50% + ${rnd(-40, 10)}px)) scale(1.8)` }], { duration: rnd(600, 1000), delay: rnd(0, 200) }); } }

  // ---------- เอฟเฟกต์ตามชนิดไพ่ ----------
  const NAME = (k) => (SG.CARD_TYPES[k] || {}).name || k;
  const TRICK_BANNER = { dismantle: ['#ff9a3d', 'เผาทำลาย!'], steal: ['#9ad7ff', 'ปล้น!'], harvest: ['#e6d56a', 'ฤดูเก็บเกี่ยว'], duel: ['#ff5a3d', 'ท้าสู้!'], draw2: ['#8ff0c0', ''], nullify: ['#c58bff', 'ยกเลิก!'], barbarians: ['#ff7a3d', 'คนเถื่อนรุกราน!'], arrows: ['#ffd24a', 'ห่าเกาทัณฑ์!'], peachGarden: ['#ff9ac4', 'โอสถสวรรค์'], borrow: ['#9ad7ff', 'ยืมมือสังหาร!'], indulgence: ['#c58bff', 'มีสุขลืมเมือง'], fireboat: ['#ff8a3d', 'เรือระเบิดเพลิง!'] };

  function use(m, env) {
    const k = m.as || m.cards[0].key, kind = (SG.CARD_TYPES[k] || {}).kind;
    const A = pos(env, m.by), T = (m.targets || []).map((s) => pos(env, s)), c = mid();
    if (TRICK_BANNER[k] && TRICK_BANNER[k][1]) banner(TRICK_BANNER[k][1], TRICK_BANNER[k][0], k === 'duel' || k === 'barbarians' || k === 'arrows' || k === 'fireboat' ? '' : `[${m.by + 1}] ใช้ ${NAME(k)}`);
    switch (k) {
      case 'attack': T.forEach((t) => slash(A, t)); break;
      case 'defend': break;
      case 'heal': break; // เอฟเฟกต์ฟื้นพลังมากับเหตุการณ์ hp
      case 'dismantle': T.forEach((t) => { fireWash(); burst(t.x, t.y, ['🔥', '🔥', '💥'], 10, 80, 900, 28); rise(t.x, t.y + 20, '🔥', 8, 60, 1100, 30); }); break;
      case 'steal': T.forEach((t) => { beam(t, A, '🂠', 600, 34, 20); burst(t.x, t.y, '✨', 6, 50, 600); }); break;
      case 'harvest': rain(['🌾', '🌾', '🍚', '✨'], 30, 1500, 26); break;
      case 'draw2': ring(A.x, A.y, '#8ff0c0', 110, 700); burst(A.x, A.y, ['🂠', '✨'], 6, 70, 700); break;
      case 'nullify': { ring(c.x, c.y, '#c58bff', 260, 800); const d = mk('✖', { left: c.x + 'px', top: c.y + 'px', fontSize: '150px', color: '#c58bff', textShadow: '0 0 30px #c58bff' }); go(d, [{ opacity: 0, transform: 'translate(-50%,-50%) scale(2.4) rotate(-20deg)' }, { opacity: 1, transform: 'translate(-50%,-50%) scale(1) rotate(0)', offset: 0.35 }, { opacity: 0, transform: 'translate(-50%,-50%) scale(.9)' }], { duration: 900 }); break; }
      case 'barbarians': {
        shakeScreen(8, 800);
        for (let i = 0; i < 9; i++) { const d = mk(['🪓', '🐗', '🏹'][i % 3], { left: '-60px', top: rnd(innerHeight * 0.2, innerHeight * 0.65) + 'px', fontSize: rnd(38, 60) + 'px' }, 'em'); go(d, [{ opacity: 0, transform: 'translateX(0) rotate(-8deg)' }, { opacity: 1, offset: 0.1 }, { opacity: 1, transform: `translateX(${innerWidth + 120}px) rotate(8deg)`, offset: 0.9 }, { opacity: 0 }], { duration: rnd(900, 1300), delay: rnd(0, 450), easing: 'ease-in-out' }); }
        for (let i = 0; i < 8; i++) dust(rnd(40, innerWidth - 40), rnd(innerHeight * 0.45, innerHeight * 0.75), 2);
        break;
      }
      case 'arrows': arrowVolley(); flash('rgba(20,10,0,.6)', 0.5, 900); break;
      case 'peachGarden': rain(['🌸', '🍑', '🌸', '✨'], 34, 1700, 26); flash('rgba(255,150,200,.4)', 0.4, 900); break;
      case 'borrow': T.slice(0, 1).forEach((t) => beam(A, t, '🗡️', 520, 36, 540)); break;
      case 'duel': {
        const l = mk('🗡️', { left: c.x - 150 + 'px', top: c.y + 'px', fontSize: '110px' }), r = mk('🗡️', { left: c.x + 150 + 'px', top: c.y + 'px', fontSize: '110px' });
        go(l, [{ opacity: 0, transform: 'translate(-50%,-50%) rotate(35deg) translateX(-120px)' }, { opacity: 1, transform: 'translate(-50%,-50%) rotate(35deg) translateX(0)', offset: 0.4 }, { opacity: 1, transform: 'translate(-50%,-50%) rotate(35deg) translateX(60px)', offset: 0.5 }, { opacity: 0, transform: 'translate(-50%,-50%) rotate(35deg) translateX(60px)' }], { duration: 1000 });
        go(r, [{ opacity: 0, transform: 'translate(-50%,-50%) scaleX(-1) rotate(35deg) translateX(-120px)' }, { opacity: 1, transform: 'translate(-50%,-50%) scaleX(-1) rotate(35deg) translateX(0)', offset: 0.4 }, { opacity: 1, transform: 'translate(-50%,-50%) scaleX(-1) rotate(35deg) translateX(60px)', offset: 0.5 }, { opacity: 0, transform: 'translate(-50%,-50%) scaleX(-1) rotate(35deg) translateX(60px)' }], { duration: 1000 });
        setTimeout(() => { burst(c.x, c.y, ['✦', '✧', '⚡'], 14, 110, 600, 26); shakeScreen(5, 300); }, 420);
        break;
      }
      case 'indulgence': T.forEach((t) => { rise(t.x, t.y, ['🍷', '💤', '🎶'], 7, 60, 1300, 24); ring(t.x, t.y, '#c58bff', 140, 900); }); break;
      case 'fireboat': {
        const d = mk('🚢', { left: '-80px', top: innerHeight * 0.4 + 'px', fontSize: '80px' }, 'em');
        go(d, [{ opacity: 1, transform: 'translateX(0) rotate(-4deg)' }, { opacity: 1, transform: `translateX(${innerWidth * 0.5}px) rotate(4deg)`, offset: 0.6 }, { opacity: 0, transform: `translateX(${innerWidth + 100}px) rotate(-4deg)` }], { duration: 1300, easing: 'ease-in-out' });
        rise(A.x, A.y, '🔥', 6, 60, 1000, 26);
        break;
      }
      default:
        if (kind === 'weapon') { ring(A.x, A.y, '#ffd24a', 130, 750); burst(A.x, A.y, ['✨', '⚔️'], 8, 80, 800); label(env, m.by, '⚔ ' + NAME(k), '#ffd24a'); }
        else if (kind === 'armor') { ring(A.x, A.y, '#6bd0ff', 130, 750); burst(A.x, A.y, ['🛡️', '✨'], 7, 70, 800); label(env, m.by, '🛡 ' + NAME(k), '#9ad7ff'); }
        else if (kind === 'horse') { dust(A.x, A.y + 10, 12); burst(A.x, A.y, ['🐎', '💨'], 5, 70, 800); label(env, m.by, '🐎 ' + NAME(k), '#e6d56a'); }
    }
  }

  function resp(m, env) {
    const A = pos(env, m.by);
    if (m.need === 'defend') {
      const d = mk('🛡️', { left: A.x + 'px', top: A.y + 'px', fontSize: '84px', filter: 'drop-shadow(0 0 16px #6bd0ff)' }, 'em');
      go(d, [{ opacity: 0, transform: 'translate(-50%,-50%) scale(.3)' }, { opacity: 1, transform: 'translate(-50%,-50%) scale(1.15)', offset: 0.3 }, { opacity: 1, transform: 'translate(-50%,-50%) scale(1)', offset: 0.7 }, { opacity: 0, transform: 'translate(-50%,-50%) scale(1.3)' }], { duration: 900 });
      ring(A.x, A.y, '#6bd0ff', 150, 650); burst(A.x, A.y, ['✦', '✧'], 8, 80, 500, 18);
    } else if (m.need === 'attack') { burst(A.x, A.y, ['⚔️', '✦'], 6, 70, 600, 22); }
    else if (m.need === 'nullify') { ring(A.x, A.y, '#c58bff', 150, 700); label(env, m.by, '✖ ยกเลิกอุบาย', '#d9a8ff'); const c = mid(); ring(c.x, c.y, '#c58bff', 280, 900); const x = mk('✖', { left: c.x + 'px', top: c.y + 'px', fontSize: '160px', color: '#c58bff', textShadow: '0 0 30px #c58bff' }); go(x, [{ opacity: 0, transform: 'translate(-50%,-50%) scale(2.4) rotate(-20deg)' }, { opacity: 1, transform: 'translate(-50%,-50%) scale(1) rotate(0)', offset: 0.3 }, { opacity: 1, offset: 0.75 }, { opacity: 0, transform: 'translate(-50%,-50%) scale(.9)' }], { duration: 1200 }); banner('ยกเลิกอุบาย!', '#d9a8ff', `[${m.by + 1}] ${env.nm(m.by)} ใช้ยกเลิก — ผลอุบายหายทั้งหมด`); }
    else if (m.need === 'heal') { const T = pos(env, m.to !== undefined ? m.to : m.by); beam(A, T, '💊', 500, 30); }
  }

  function hp(m, env) {
    const P = pos(env, m.seat);
    if (m.d < 0) {
      shake(env, m.seat, Math.min(16, 6 + -m.d * 3), 450);
      burst(P.x, P.y, ['💥', '✦', '•'], 6 + -m.d * 3, 60 + -m.d * 20, 700, 24);
      if (m.seat === env.you) flash('rgba(255,40,20,.8)', 0.35 + Math.min(0.25, -m.d * 0.08), 520);
      if (-m.d >= 2) shakeScreen(6 + -m.d * 2, 500);
      if (-m.d >= 3) { burst(P.x, P.y, ['🔥', '💥'], 14, 130, 900, 34); fireWash(); }
    } else {
      rise(P.x, P.y + 10, ['✚', '✨', '💚'], 8, 50, 1200, 22); ring(P.x, P.y, '#6be0b0', 120, 800);
    }
  }

  function judgeFlip() {
    const c = document.querySelector('#fx-root .fxp.judge .card.lg:last-of-type, #fx-root .fxp.judge .card.lg');
    if (c) c.animate([{ transform: 'perspective(600px) rotateY(100deg) scale(.7)', filter: 'brightness(2.2)' }, { transform: 'perspective(600px) rotateY(-12deg) scale(1.06)', filter: 'brightness(1.4)', offset: 0.7 }, { transform: 'perspective(600px) rotateY(0) scale(1)', filter: 'brightness(1)' }], { duration: 650, easing: 'ease-out' });
  }

  function death(m, env) {
    const P = pos(env, m.seat);
    flash('rgba(0,0,0,.85)', 0.55, 900); shakeScreen(9, 600);
    rise(P.x, P.y, ['💀', '🩸', '💨'], 8, 60, 1500, 34);
    ring(P.x, P.y, '#ff3a2a', 200, 1000);
    banner('☠ ล้มลง', '#ff6a55', `[${m.seat + 1}] ${env.nm(m.seat)}`);
  }

  function skill(m, env) {
    const A = pos(env, m.by);
    ring(A.x, A.y, '#ffd24a', 140, 800); label(env, m.by, '✦ ' + m.name, '#ffe28a');
    (m.targets || []).filter((s) => s !== m.by).forEach((s) => { const T = pos(env, s); beam(A, T, '✨', 500, 28); });
  }

  // ---------- ฉากจบเกม ----------
  let endRaf = 0;
  function ending(kind, text, done) {
    if (!enabled()) { done && done(); return; }
    const old = document.getElementById('endfx'); if (old) old.remove(); cancelAnimationFrame(endRaf);
    const box = document.createElement('div'); box.id = 'endfx'; box.className = kind;
    box.innerHTML = `<canvas></canvas><div class="etxt"><div class="e1">${kind === 'win' ? '🏆 ชัยชนะ!' : kind === 'lose' ? '☠ พ่ายแพ้' : '⚖ เสมอ'}</div><div class="e2">${text || ''}</div></div>`;
    document.body.appendChild(box);
    const cv = box.querySelector('canvas'), ctx = cv.getContext('2d'); const dpr = Math.min(2, window.devicePixelRatio || 1);
    const fit = () => { cv.width = innerWidth * dpr; cv.height = innerHeight * dpr; cv.style.width = '100%'; cv.style.height = '100%'; }; fit();
    const parts = []; let t0 = performance.now(), lastLaunch = 0;
    const COLORS = ['#ffd24a', '#ff6a55', '#6bd0ff', '#8ff0c0', '#ff9ac4', '#fff'];
    function explode(x, y) { const col = COLORS[Math.floor(Math.random() * COLORS.length)]; for (let i = 0; i < 70; i++) { const a = Math.random() * Math.PI * 2, s = rnd(1.5, 6); parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 1, col, g: 0.06, r: rnd(1.5, 3) }); } }
    function ash() { parts.push({ x: rnd(0, innerWidth), y: -10, vx: rnd(-0.5, 0.5), vy: rnd(0.8, 2.2), life: 1, col: Math.random() < 0.3 ? '#ff7a4a' : '#777', g: 0, r: rnd(1, 3.2), slow: 1 }); }
    function confetti() { parts.push({ x: rnd(0, innerWidth), y: -10, vx: rnd(-1, 1), vy: rnd(1.5, 3.5), life: 1, col: COLORS[Math.floor(Math.random() * COLORS.length)], g: 0.01, r: rnd(2, 4), rect: 1 }); }
    function frame(now) {
      const el = now - t0;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, innerWidth, innerHeight);
      if (kind === 'win') { if (now - lastLaunch > 360 && el < 5200) { lastLaunch = now; explode(rnd(innerWidth * 0.15, innerWidth * 0.85), rnd(innerHeight * 0.12, innerHeight * 0.5)); } for (let i = 0; i < 2; i++) confetti(); }
      else if (kind === 'lose') { for (let i = 0; i < 3; i++) ash(); } else { if (now - lastLaunch > 900 && el < 3000) { lastLaunch = now; explode(rnd(innerWidth * 0.3, innerWidth * 0.7), rnd(innerHeight * 0.2, innerHeight * 0.4)); } }
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i]; p.x += p.vx; p.y += p.vy; p.vy += p.g; p.life -= p.slow ? 0.003 : (p.rect ? 0.004 : 0.014);
        if (p.life <= 0 || p.y > innerHeight + 20) { parts.splice(i, 1); continue; }
        ctx.globalAlpha = Math.max(0, p.life); ctx.fillStyle = p.col;
        if (p.rect) ctx.fillRect(p.x, p.y, p.r * 2, p.r); else { ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fill(); }
      }
      endRaf = requestAnimationFrame(frame);
    }
    endRaf = requestAnimationFrame(frame);
    let closed = false;
    const close = () => { if (closed) return; closed = true; cancelAnimationFrame(endRaf); box.classList.add('out'); setTimeout(() => box.remove(), 500); done && done(); };
    box.addEventListener('click', close); setTimeout(close, 4200);
  }

  function onFx(m, env) {
    if (!enabled()) return;
    try {
      switch (m.k) {
        case 'use': use(m, env); break;
        case 'resp': resp(m, env); break;
        case 'hp': hp(m, env); break;
        case 'judge': judgeFlip(); break;
        case 'death': death(m, env); break;
        case 'skill': skill(m, env); break;
      }
    } catch (e) { /* เอฟเฟกต์ล้มเหลวต้องไม่กระทบเกม */ }
  }
  return { onFx, ending, enabled, shakeScreen };
})();
window.SGFX = SGFX;
