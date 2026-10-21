try { window.SG_LOGHIDE = !!localStorage.getItem('sg_loghide'); } catch (e) {}
try { window.SG_NOFX = !!localStorage.getItem('sg_nofx'); } catch (e) {}
'use strict';
const { CARD_TYPES, SUITS, HEROES, ROLE_NAMES, FACTIONS, ROLE_TABLE } = SG;
const HERO = Object.fromEntries(HEROES.map((h) => [h.id, h]));
const $ = (s) => document.querySelector(s);
const escRaw = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const TOK = /⟦(\d+)\|([^⟧]*)⟧/g;
const esc = (s) => escRaw(String(s ?? '').replace(TOK, '$2'));
const DECK = Object.fromEntries(SG.buildDeck().map((c) => [c.id, c]));
const SEATC = ['#ef5a4f', '#4a94f0', '#4fc86f', '#f0be3a', '#b66cf0', '#34cfcf', '#f08a3a', '#f06cb4', '#a3d34a', '#9aa3b8'];
const seatColor = (i) => SEATC[((i % 10) + 10) % 10];
const numTint = (h) => h.replace(/\[(\d{1,2})\]/g, (m0, n) => `<span class="sn" style="--sc:${seatColor(+n - 1)}">[${n}]</span>`);
const richLog = (s) => { let o = '', i = 0, m; const str = String(s ?? ''); TOK.lastIndex = 0; while ((m = TOK.exec(str))) { o += numTint(escRaw(str.slice(i, m.index))) + `<a class="clog" data-cinfo="${m[1]}">${escRaw(m[2])}</a>`; i = m.index + m[0].length; } return o + numTint(escRaw(str.slice(i))); };
const ls = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} } };

const S = { stage: null, preview: null, ws: null, uid: ls.get('sg_uid') || ('u' + Math.random().toString(36).slice(2, 12) + Date.now().toString(36)), name: ls.get('sg_name') || '', room: null, view: null, ask: null, logs: [], sel: {}, over: null, modal: null, logOpen: false, logHide: !!window.SG_LOGHIDE, topHide: !!ls.get('sg_tophide'), handHide: false, handHideAsk: null, lines: null, connected: false, joinCode: '' };
ls.set('sg_uid', S.uid);

// ---------- เครือข่าย ----------
function connect() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${proto}://${location.host}`); S.ws = ws;
  ws.onopen = () => { S.connected = true; ws.send(JSON.stringify({ t: 'hello', uid: S.uid, name: S.name })); render(); };
  ws.onclose = () => { S.connected = false; render(); setTimeout(connect, 1500); };
  ws.onmessage = (e) => { let m; try { m = JSON.parse(e.data); } catch (x) { return; } onMsg(m); };
}
const send = (o) => { if (S.ws && S.ws.readyState === 1) S.ws.send(JSON.stringify(o)); };
function onMsg(m) {
  switch (m.t) {
    case 'room': S.room = m; if (m.state === 'lobby') { S.view = null; S.ask = null; S.over = null; S.stage = null; } render(); break;
    case 'state': S.view = m; render(); break;
    case 'ask': S.ask = { id: m.id, req: m.req, deadline: m.deadline }; S.sel = {}; S.preview = null; if (S.handHide && S.handHideAsk !== m.id && ['play', 'respond', 'cards'].includes(m.req.type)) S.handHide = false; render(); break;
    case 'log': addLog(m.msg, m.priv); break;
    case 'logs': S.logs = m.logs.map((x) => ({ msg: x })); render(); break;
    case 'reveal': S.modal = { type: 'reveal', title: m.title, cards: m.cards }; render(); break;
    case 'over': S.over = m; S.ask = null; S.showOver = false; render(); { const me = S.view ? S.over.roles.find((r) => r.seat === S.view.you) : null; const side = m.winner.side; const mine = me && ((side === 'lord' && (me.role === 'lord' || me.role === 'loyal')) || side === me.role); const kind = side === 'draw' ? 'draw' : mine ? 'win' : 'lose'; if (window.SGFX && SGFX.enabled()) SGFX.ending(kind, m.winner.text, () => { S.showOver = true; render(); }); else { S.showOver = true; render(); } } break;
    case 'fx': onFx(m); break;
    case 'ask_expired': if (S.ask && S.ask.id === m.id) { S.ask = null; S.sel = {}; S.preview = null; render(); } break;
    case 'err': toast(m.msg); break;
    case 'left': S.room = null; S.view = null; S.ask = null; S.over = null; S.logs = []; render(); break;
    case 'welcome': break;
    case 'rooms': S.rooms = m.list; if (!S.room) { const box = document.querySelector('.rooms'); if (box) { const t = document.createElement('div'); t.innerHTML = homeHtml(); const nb = t.querySelector('.rooms'); if (nb) { box.innerHTML = nb.innerHTML; const rc = document.querySelector('.rcount'); if (rc) rc.textContent = (S.rooms || []).length + ' ห้อง'; } } else render(); } break;
  }
}
function addLog(msg, priv) {
  S.logs.push({ msg, priv }); if (S.logs.length > 300) S.logs.shift();
  const el = $('.log .lines'); if (el) { el.insertAdjacentHTML('beforeend', logLine({ msg, priv })); el.scrollTop = el.scrollHeight; }
}
function toast(t) { const el = $('#toast'); el.textContent = t; el.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('show'), 2600); }
function answer(ans) { if (!S.ask) return; S.preview = null; send({ t: 'answer', id: S.ask.id, ans }); S.ask = null; S.sel = {}; render(); }

// ---------- ช่วยแสดงผล ----------
const cardName = (c) => (CARD_TYPES[c.as || c.key] || CARD_TYPES[c.key]).name;
const suitHtml = (s) => `<span style="color:${s === 'C' || s === 'S' ? '#c8211a' : '#111'}">${SUITS[s]}</span>`;
function cardEl(c, opts = {}) {
  const t = CARD_TYPES[c.key];
  const idAttr = opts.info ? `data-cinfo="${c.id}"` : `data-card="${c.id}"`;
  const cls = ['card', opts.sm ? 'sm' : '', opts.lg ? 'lg' : '', opts.dim ? 'dim' : '', opts.ok ? 'ok' : '', opts.sel ? 'sel' : ''].join(' ');
  const red = c.suit === 'C' || c.suit === 'S';
  return `<div class="${cls}" ${idAttr} data-key="${c.key}" style="background-image:url(img/cards/${c.key}.jpg)" title="${esc(t.name)} — ${esc(t.desc)}"><div class="sb ${red ? 'red' : ''}">${SUITS[c.suit]}${c.num}</div><div class="nm">${esc(t.name)}</div></div>`;
}
const shortName = (n) => String(n || '').replace(/^\[\d+\]\s*/, '');
const pips = (hp, max) => Array.from({ length: max }, (_, i) => `<span class="pip ${i < hp ? '' : 'empty'}"></span>`).join('');
function dist(v, a, b) { const al = v.players.filter((p) => p.alive); const d = Math.abs(al.findIndex((p) => p.seat === a) - al.findIndex((p) => p.seat === b)); return Math.min(d, al.length - d); }
function logLine(l) {
  const cls = l.msg.startsWith('──') ? 'turn' : l.priv ? 'priv' : '';
  return `<div class="${cls}">${richLog(l.msg)}</div>`;
}

// ---------- หน้าจอหลัก ----------
function render() {
  const app = $('#app');
  const keepLog = $('.log .lines'); const logScroll = keepLog ? keepLog.scrollTop : 0, logBottom = keepLog ? keepLog.scrollHeight - keepLog.scrollTop - keepLog.clientHeight < 40 : true;
  const handScroll = $('.hand') ? $('.hand').scrollLeft : 0;
  if (S.view && S.room && S.room.state !== 'lobby') app.innerHTML = gameHtml();
  else if (S.room && S.room.state === 'playing') app.innerHTML = waitHtml();
  else if (S.room) app.innerHTML = roomHtml();
  else app.innerHTML = homeHtml();
  const l = $('.log .lines'); if (l) l.scrollTop = logBottom ? l.scrollHeight : logScroll;
  if ($('.hand')) $('.hand').scrollLeft = handScroll;
  renderModal();
  tickTimer();
  drawLines();
}

function homeHtml() {
  return `<div class="wrap">
  <div class="logo">⚔ สามก๊กกลยุทธ์ <span class="sub" style="font-size:16px">ออนไลน์</span></div>
  <p class="sub">เกมการ์ดบทบาทลับ 2–10 คน — จักรพรรดิ์ · ภักดี · กบฎ · ทรยศ ${S.connected ? '' : '<b style="color:#ff8a70"> (กำลังเชื่อมต่อ...)</b>'}</p>
  <div class="panel">
    <h3>ชื่อของคุณ</h3>
    <div class="row"><input id="name" maxlength="16" placeholder="ใส่ชื่อ" value="${esc(S.name)}" style="width:220px"></div>
  </div>
  <div class="panel">
    <h3>สร้างห้องใหม่</h3>
    <div class="row"><input id="rtitle" maxlength="24" placeholder="ชื่อห้อง (ไม่ใส่ก็ได้)" style="width:240px" value="${esc(S.rtitle || '')}"><label class="sub" style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="rpriv" ${S.rpriv ? 'checked' : ''}> ห้องส่วนตัว (ไม่แสดงในล็อบบี้ เข้าด้วยรหัส)</label><button class="primary" data-a="create">สร้างห้อง</button></div>
  </div>
  <div class="panel">
    <div class="row"><h3 class="grow" style="margin:0">🏯 ล็อบบี้ — ห้องที่เปิดอยู่</h3><span class="sub rcount">${(S.rooms || []).length} ห้อง</span></div>
    <div class="rooms">${(S.rooms || []).length ? S.rooms.map((r) => `<div class="roomrow"><div class="grow"><b>${esc(r.title)}</b><div class="sub">เจ้าของห้อง ${esc(r.host)} · ผู้เล่น ${r.n}/10${r.bots ? ` (บอต ${r.bots})` : ''} · <span style="color:${r.state === 'playing' ? '#ff9a84' : '#8ff0c0'}">${r.state === 'playing' ? 'กำลังเล่น' : 'รอผู้เล่น'}</span></div></div><button class="primary" data-a="joinroom" data-code="${esc(r.code)}" ${r.state === 'playing' || r.n >= 10 ? 'disabled' : ''}>เข้าร่วม</button></div>`).join('') : '<div class="sub" style="padding:12px 0">ยังไม่มีห้องที่เปิดอยู่ — สร้างห้องแรกได้เลย</div>'}</div>
    <details style="margin-top:8px"><summary class="sub" style="cursor:pointer">มีรหัสห้องส่วนตัว?</summary>
    <div class="row" style="margin-top:8px"><input id="code" maxlength="4" placeholder="รหัส 4 ตัว" style="width:150px;text-transform:uppercase;letter-spacing:4px;font-weight:700" value="${esc(S.joinCode)}"><button data-a="join">เข้าห้อง</button></div></details>
  </div>
  <div class="row"><button class="ghost" data-a="rules">📖 วิธีเล่น / กติกา</button><button class="ghost" data-a="heroes">🎴 ดูขุนศึกทั้งหมด</button></div>
  </div>`;
}

function waitHtml() {
  return `<div class="wrap"><div class="logo">⚔ เตรียมเกม</div><div class="panel"><h3>${S.ask ? 'กำลังรอคุณ...' : 'กำลังแจกบทบาท / เลือกขุนศึก — รอผู้เล่นอื่นสักครู่'}</h3><div class="log wait"><div class="lines">${S.logs.slice(-8).map(logLine).join('')}</div></div></div></div>`;
}
function roomHtml() {
  const r = S.room; const isHost = r.host === S.uid; const n = r.members.length;
  const need = ROLE_TABLE[n];
  return `<div class="wrap">
  <div class="logo">⚔ ห้องรอเล่น</div>
  <div class="panel">
    <div class="sub">${esc(r.title || 'ห้องเล่น')} ${r.priv ? '(ห้องส่วนตัว — ส่งรหัสให้เพื่อน)' : '(เปิดในล็อบบี้ — เพื่อนกดเข้าร่วมได้เลย)'}</div>
    <div class="row"><span class="code">${esc(r.code)}</span><button data-a="copy">คัดลอกลิงก์</button></div>
    ${r.winner ? `<p>เกมที่แล้ว: <b>${esc(r.winner.text)}</b></p>` : ''}
    <h3>ผู้เล่น ${n}/10</h3>
    <div class="members">${r.members.map((m, i) => `<div class="member ${m.connected ? '' : 'off'}"><span class="dot"></span><span class="grow">${esc(m.name)}${m.uid === S.uid ? ' (คุณ)' : ''}</span>${m.uid === r.host ? '<span class="tag">เจ้าของห้อง</span>' : ''}${m.isBot ? '<span class="tag">บอต</span>' : ''}${isHost && m.isBot ? `<button data-a="rmbot" data-i="${i}" style="padding:2px 8px">✕</button>` : ''}${isHost && !m.isBot && m.uid !== S.uid ? `<button data-a="kick" data-i="${i}" style="padding:2px 8px" title="เตะออก">✕</button>` : ''}</div>`).join('')}</div>
    ${need ? `<div class="sub">บทบาทเมื่อ ${n} คน: จักรพรรดิ์ 1 · ภักดี ${need.loyal} · กบฎ ${need.rebel} · ทรยศ ${need.traitor}</div>` : '<div class="sub">ต้องมีผู้เล่นอย่างน้อย 2 คน</div>'}
    <div class="row" style="margin-top:12px">
      ${isHost ? `<button data-a="addbot" ${n >= 10 ? 'disabled' : ''}>+ เพิ่มบอต</button><button class="primary" data-a="start" ${n < 2 ? 'disabled' : ''}>เริ่มเกม</button>` : '<span class="sub">รอเจ้าของห้องกดเริ่มเกม...</span>'}
      <span class="grow"></span><button class="ghost" data-a="rules">📖 กติกา</button><button class="danger" data-a="leave">ออกจากห้อง</button>
    </div>
  </div></div>`;
}

const eqThumbs = (p, big) => ['weapon', 'armor', 'horse'].map((sl) => p.equip[sl] ? `<span class="eqc ${big ? 'big' : ''}" data-card-detail="${p.equip[sl].key}" title="${esc(CARD_TYPES[p.equip[sl].key].name)}" style="background-image:url(img/cards/${p.equip[sl].key}.jpg)"><i>${{ weapon: '⚔', armor: '🛡', horse: '🐎' }[sl]}</i></span>` : '').join('')
  + p.delayed.map((d) => `<span class="eqc dl ${big ? 'big' : ''}" data-card-detail="${d.key}" title="${esc(CARD_TYPES[d.key].name)}" style="background-image:url(img/cards/${d.key}.jpg)"><i>⏳</i></span>`).join('');
function seatHtml(p, v, pos) {
  const h = HERO[p.hero] || {};
  const targetable = S.sel.targetable && S.sel.targetable.includes(p.seat);
  const picked = (S.sel.targets || []).includes(p.seat);
  const role = p.role ? `<span class="role ${p.role === 'lord' ? 'lord' : ''}">${ROLE_NAMES[p.role]}</span>` : '';
  const d = p.seat === v.you ? '' : (p.alive ? ` · ห่าง ${dist(v, v.you, p.seat)}` : '');
  return `<div class="seat faction-${h.faction} ${p.alive ? '' : 'dead'} ${v.cur === p.seat ? 'cur' : ''} ${targetable ? 'targetable' : ''} ${picked ? 'picked' : ''}" data-seat="${p.seat}" style="--sc:${seatColor(p.seat)};left:${pos.x}%;top:${pos.y}%">
    <span class="seatno">${p.seat + 1}</span>${role}<div class="port" data-hero-detail="${p.hero}" style="background-image:url(img/heroes/${p.hero}.jpg)"></div>
    <div class="meta"><div class="nm">${esc(shortName(p.name))}${p.isBot ? ' 🤖' : ''}</div><div class="hn hh">${esc(h.name || '')} · ${FACTIONS[h.faction] || ''}</div>
    <div class="hp">${pips(Math.max(0, p.hp), p.maxHp)}</div>
    <div class="hn hr">🃏 ${p.hand} · ⚔ ${p.range}${d}</div>
    <div class="eqrow">${eqThumbs(p)}</div></div></div>`;
}
// ตำแหน่งบนวงรี: เราอยู่กลางล่างเสมอ คนถัดไปตามเข็มนาฬิกา
function tablePos(i, m) {
  const phi = ((i + 1) * 360 / (m + 1)) * Math.PI / 180;
  const rx = m >= 6 ? 41 : 38, ry = 36;
  return { x: +(50 - rx * Math.sin(phi)).toFixed(1), y: +(50 + ry * Math.cos(phi)).toFixed(1) };
}

function gameHtml() {
  const v = S.view, me = v.players[v.you], h = HERO[me.hero] || {};
  const others = v.players.filter((p) => p.seat !== v.you).sort((a, b) => ((a.seat - v.you + v.players.length) % v.players.length) - ((b.seat - v.you + v.players.length) % v.players.length));
  const cur = v.players[v.cur];
  const m = others.length;
  return `<div id="game" class="${S.topHide ? 'tophide' : ''} ${S.handHide ? 'handhide' : ''} n${m}">
  <button class="topfab" data-a="toptoggle" title="แสดง/ซ่อนแถบด้านบน">${S.topHide ? '▼' : '▲'}</button>
  <div class="topbar"><div class="info"><span>รอบ <b>${v.round}</b></span><span class="mini">กองจั่ว <b>${v.deck}</b></span><span class="mini linkish" data-a="showdiscard">กองทิ้ง <b>${v.discardN}</b> 🔍</span><span>ตาของ <b>${cur ? `<span class="sn" style="--sc:${seatColor(cur.seat)}">[${cur.seat + 1}]</span> ${esc(shortName(cur.name))}` : '-'}</b></span><span class="sub">ห้อง ${esc(S.room.code)}</span><span class="linkish" data-a="togglefx" title="เอฟเฟกต์">${window.SG_NOFX ? '✨ปิด' : '✨เปิด'}</span></div>
    <button class="ghost togglelog" data-a="togglelog">📜 บันทึก</button><button class="ghost" data-a="rules">📖</button><button class="ghost" data-a="leavegame">ออก</button></div>
  <div class="main"><div class="tablecol">
    <div class="table">
      ${others.map((p, i) => seatHtml(p, v, tablePos(i, m))).join('')}
      <div class="center">${centerHtml(v)}</div>
    </div>
    ${bannerHtml()}
    <div class="me" style="--sc:${seatColor(me.seat)}">
      <div class="mehead ${me.alive ? '' : 'dead'} ${S.sel.targetable && S.sel.targetable.includes(me.seat) ? 'targetable' : ''} ${(S.sel.targets || []).includes(me.seat) ? 'picked' : ''}" data-seat="${me.seat}">
        <div class="portwrap"><span class="seatno">${me.seat + 1}</span><div class="port" data-hero-detail="${me.hero}" style="background-image:url(img/heroes/${me.hero}.jpg)"></div></div>
        <div><div><b>${esc(shortName(me.name))}</b> · ${esc(h.name || '')} <span class="tag">${ROLE_NAMES[me.role]}</span> ${me.alive ? '' : '<b style="color:#ff8a70">ตายแล้ว</b>'}</div><div class="hp" style="margin:2px 0">${pips(Math.max(0, me.hp), me.maxHp)}<span class="chip" style="margin-left:6px">⚔ ระยะ ${me.range}</span></div></div>
        <div class="eqrow me-eq">${eqThumbs(me, true)}</div>
        <div class="skills">${skillButtons()}</div>
        <button class="ghost handtoggle" data-a="handtoggle">🂠 ไพ่ ${v.hand.length} ${S.handHide ? '▴ แสดง' : '▾ ซ่อน'}</button>
      </div>
      <div class="hand">${v.hand.map((c) => handCard(c)).join('') || '<span class="sub">ไม่มีไพ่ในมือ</span>'}</div>
    </div></div>
    <div class="log ${S.logOpen ? 'open' : ''} ${S.logHide ? 'hide' : ''}"><h3>บันทึกเหตุการณ์</h3><div class="lines">${S.logs.map(logLine).join('')}</div></div></div></div>`;
}

// ---------- แถบคำสั่ง / การโต้ตอบ ----------
function handState(c) {
  const a = S.ask; if (!a) return { dim: false };
  const r = a.req, sel = S.sel;
  if (r.type === 'play') {
    if (sel.skill) { const s = r.skills.find((x) => x.id === sel.skill); const list = s && s.sel.cards ? s.sel.cards.list : []; return { dim: !list.includes(c.id), ok: list.includes(c.id), sel: (sel.skillCards || []).includes(c.id) }; }
    const ok = !!r.uses[c.id]; return { dim: !ok, ok, sel: sel.card === c.id };
  }
  if (r.type === 'respond') { const ok = r.eligible.includes(c.id) || r.multi; return { dim: !ok, ok, sel: (sel.cards || []).includes(c.id) }; }
  if (r.type === 'cards') { const ok = r.eligible.includes(c.id); return { dim: !ok, ok, sel: (sel.cards || []).includes(c.id) }; }
  return { dim: false };
}
function handCard(c) { return cardEl(c, handState(c)); }
function skillButtons() {
  const a = S.ask; if (!a || a.req.type !== 'play') return '';
  return a.req.skills.map((s) => `<button data-skill="${s.id}" class="${S.sel.skill === s.id ? 'primary' : ''}" title="${esc(s.desc)}">✦ ${esc(s.label)}</button>`).join('');
}
function bannerHtml() {
  const a = S.ask; const v = S.view;
  if (S.over) return `<div class="banner"><div class="txt">🏆 ${esc(S.over.winner.text)}</div><button class="primary" data-a="showover">ดูผล</button></div>`;
  if (!a) { const cur = v.players[v.cur]; return `<div class="banner idle"><div class="txt">${cur && cur.seat === v.you ? 'กำลังประมวลผล...' : `รอ ${cur ? `[${cur.seat + 1}] ${esc(shortName(cur.name))}` : ''} ...`}</div></div>`; }
  const r = a.req, sel = S.sel; let txt = esc(r.prompt || ''), btns = '';
  if (r.type === 'play') {
    txt = 'ตาของคุณ — เลือกไพ่หรือใช้ทักษะ';
    const s = sel.skill ? r.skills.find((x) => x.id === sel.skill) : null;
    if (s) {
      const need = [];
      if (s.sel.cards) need.push(`เลือกไพ่ ${s.sel.cards.min === s.sel.cards.max ? s.sel.cards.min : s.sel.cards.min + '+'} ใบ (${(sel.skillCards || []).length})`);
      if (s.sel.targets) { need.push(`เลือกเป้าหมาย ${s.sel.targets.min === s.sel.targets.max ? s.sel.targets.min : s.sel.targets.min + '-' + s.sel.targets.max} คน (${(sel.targets || []).length})`); }
      txt = `ทักษะ "${esc(s.label)}": ${need.join(' · ')}`;
      const okC = !s.sel.cards || ((sel.skillCards || []).length >= s.sel.cards.min && (sel.skillCards || []).length <= s.sel.cards.max);
      const okT = !s.sel.targets || ((sel.targets || []).length >= s.sel.targets.min && (sel.targets || []).length <= s.sel.targets.max);
      btns = `<button class="primary" data-a="skillgo" ${okC && okT ? '' : 'disabled'}>ยืนยัน</button><button data-a="cancelsel">ยกเลิก</button>`;
    } else if (sel.card) {
      const uses = r.uses[sel.card] || [];
      if (sel.use === undefined) { btns = uses.map((u, i) => `<button class="primary" data-use="${i}">${esc(u.label)}</button>`).join('') + '<button data-a="cancelsel">ยกเลิก</button>'; txt = 'เลือกวิธีใช้ไพ่'; }
      else {
        const u = uses[sel.use];
        if (u.kind === 'pair') txt = (sel.targets || []).length === 0 ? 'ยืมมือสังหาร: เลือกผู้ที่มีอาวุธ' : 'เลือกผู้ที่จะถูกโจมตี';
        else txt = `เลือกเป้าหมาย${u.max > 1 ? ` (สูงสุด ${u.max})` : ''}`;
        const n = (sel.targets || []).length;
        btns = `<button class="primary" data-a="usego" ${n >= u.min && n <= u.max ? '' : 'disabled'}>ยืนยัน</button><button data-a="cancelsel">ยกเลิก</button>`;
      }
    }
    btns += `<button class="${sel.card || sel.skill ? 'ghost' : 'primary'}" data-a="endturn">จบตา</button>`;
  } else if (r.type === 'respond') {
    const n = (sel.cards || []).length;
    btns = `<button class="primary" data-a="respgo" ${n >= 1 && n <= (r.multi ? 2 : 1) ? '' : 'disabled'}>ใช้ไพ่ที่เลือก</button>`;
    if (r.canArmor) btns += `<button data-a="armor">🛡 ใช้เกราะ</button>`;
    if (r.canHelp) btns += `<button data-a="help">📣 ${esc(r.helpLabel || 'ขอความช่วยเหลือ')}</button>`;
    btns += `<button class="danger" data-a="pass">ไม่ใช้</button>`;
  } else if (r.type === 'cards') {
    const n = (sel.cards || []).length;
    btns = `<button class="primary" data-a="cardsgo" ${n >= r.min && n <= r.max ? '' : 'disabled'}>ยืนยัน (${n}/${r.min === r.max ? r.min : r.min + '-' + r.max})</button>`;
    if (r.min === 0) btns += `<button data-a="pass0">ข้าม</button>`;
  } else if (r.type === 'drawpile') btns = `<button class="primary" data-a="drawpile">🂠 จั่วไพ่ ${r.n} ใบ</button>`;
  else if (r.type === 'yesno') btns = `<button class="primary" data-a="yes">ใช่</button><button data-a="no">ไม่</button>`;
  else if (r.type === 'pick' || r.type === 'arrange') txt = esc(r.prompt || '');
  return `<div class="banner"><div class="txt">${txt}</div><span class="timer" id="timer"></span>${btns}</div>`;
}
function tickTimer() {
  clearInterval(tickTimer.t);
  const f = () => { const el = $('#timer'); if (!el || !S.ask) return; const s = Math.max(0, Math.round((S.ask.deadline - Date.now()) / 1000)); el.textContent = '⏱ ' + s; };
  f(); tickTimer.t = setInterval(f, 1000);
}

// ---------- โมดอล ----------
function renderModal() {
  const root = $('#modal-root'); let html = '';
  const a = S.ask;
  if (S.preview) html = previewModal();
  else if (a && (a.req.type === 'pick' || a.req.type === 'arrange')) html = askModal(a.req);
  else if (S.modal) html = infoModal(S.modal);
  else if (S.over && S.showOver) html = overModal();
  root.innerHTML = html;
}
function askModal(r) {
  if (r.type === 'arrange') {
    S.sel.order = S.sel.order || r.cardsPub.map((c) => ({ c, bottom: false }));
    const o = S.sel.order;
    return `<div class="ov"><div class="modal"><h2>${esc(r.prompt)}</h2><div class="arr">${o.map((x, i) => `<div class="cell">${cardEl(x.c, { sm: true })}<div class="row"><button style="padding:2px 8px" data-arr="l" data-i="${i}">◀</button><button style="padding:2px 8px" data-arr="r" data-i="${i}">▶</button></div><label style="font-size:12px"><input type="checkbox" data-arr="b" data-i="${i}" ${x.bottom ? 'checked' : ''}> ใต้กอง</label></div>`).join('')}</div><div class="row" style="justify-content:center"><button class="primary" data-a="arrgo">ยืนยัน</button></div></div></div>`;
  }
  if (r.kind === 'role') {
    const c = r.ctx || {}; const goal = { lord: 'กำจัด "กบฎ" และ "ทรยศ" ให้หมด', loyal: 'ปกป้องจักรพรรดิ์ และกำจัด "กบฎ" กับ "ทรยศ"', rebel: 'กำจัด "จักรพรรดิ์" ให้ได้', traitor: 'กำจัดทุกคน เหลือรอดเป็นคนสุดท้าย (ต้องสู้จักรพรรดิ์ 1 ต่อ 1)' }[c.role];
    return `<div class="ov"><div class="modal rolecard"><div class="sub">${esc(r.prompt)}</div><div class="rolename r-${esc(c.role)}">${esc(ROLE_NAMES[c.role])}</div><p><b>เป้าหมาย:</b> ${esc(goal)}</p>${c.role === 'lord' ? '<p class="sub">คุณเป็นจักรพรรดิ์ ทุกคนเห็นตัวตนของคุณ — คุณจะได้เลือกขุนศึกก่อน</p>' : `<p class="sub">จักรพรรดิ์คือ <b>${esc(c.lordName)}</b></p>`}<p class="sub">บทบาทในเกมนี้: ${esc(c.counts)}</p><p class="sub">ห้ามบอกบทบาทตัวเองให้คนอื่นรู้ 🤫</p><div class="row" style="justify-content:center"><button class="primary" data-a="roleok">รับทราบ — ไปเลือกขุนศึก</button></div></div></div>`;
  }
  const ids = S.sel.ids || [];
  const items = r.items.map((it) => {
    const sel = ids.includes(it.id) ? 'sel' : '';
    if (r.kind === 'hero') { const h = HERO[it.hero]; return `<div class="item hero ${sel}" data-pick="${esc(it.id)}"><div class="hp" style="background-image:url(img/heroes/${it.hero}.jpg)"></div><b>${esc(h.name)}</b> <span class="sub">${FACTIONS[h.faction]} · ❤${h.hp}</span>${h.skills.map((s) => `<small><b>${esc(s[0])}:</b> ${esc(s[1])}</small>`).join('')}</div>`; }
    if (it.back) return `<div class="item backitem ${sel}" data-pick="${esc(it.id)}"><div class="card sm back"></div><small>${esc(it.label)}</small></div>`;
    if (it.card) return `<div class="item ${sel}" data-pick="${esc(it.id)}">${cardEl(it.card, { sm: true, info: false })}<small>${esc(it.label)}</small></div>`;
    if (r.kind === 'zone' && it.cardId) return `<div class="item ${sel}" data-pick="${esc(it.id)}">${esc(it.label)}</div>`;
    return `<div class="item ${sel}" data-pick="${esc(it.id)}">${esc(it.label)}</div>`;
  }).join('');
  const n = ids.length;
  return `<div class="ov"><div class="modal"><h2>${esc(r.prompt)}</h2><div class="items">${items}</div><div class="row" style="justify-content:center"><button class="primary" data-a="pickgo" ${n >= (r.min || 0) && n <= r.max ? '' : 'disabled'}>ยืนยัน${r.max > 1 ? ` (${n}/${r.max})` : ''}</button>${r.min === 0 ? '<button data-a="pickskip">ข้าม</button>' : ''}</div></div></div>`;
}
function previewModal() {
  const pv = S.preview, c = (S.view.hand || []).find((x) => x.id === pv.id); if (!c) return '';
  const t = CARD_TYPES[c.key]; const kind = { basic: 'ไพ่พื้นฐาน', trick: 'อุบาย', delayed: 'อุบายหน่วงเวลา', weapon: 'ยุทโธปกรณ์ · อาวุธ', armor: 'ยุทโธปกรณ์ · เกราะ', horse: 'ยุทโธปกรณ์ · ม้า' }[t.kind];
  return `<div class="ov"><div class="modal preview"><div class="pvrow"><div class="card lg" style="background-image:url(img/cards/${c.key}.jpg)"><div class="sb ${c.suit === 'C' || c.suit === 'S' ? 'red' : ''}">${SUITS[c.suit]}${c.num}</div></div><div class="pvtxt"><h2>${esc(t.name)}</h2><div class="sub">${kind}</div><p>${esc(t.desc)}</p></div></div><div class="row" style="justify-content:center;margin-top:12px"><button class="primary" data-a="previewok">ยืนยันใช้การ์ดนี้</button><button data-a="previewcancel">ยกเลิก</button></div></div></div>`;
}
function infoModal(m) {
  let body = '';
  if (m.type === 'card') { const t = CARD_TYPES[m.key]; const red = m.suit === 'C' || m.suit === 'S'; body = `<div class="pvrow"><div class="card lg" style="background-image:url(img/cards/${m.key}.jpg)">${m.suit ? `<div class="sb ${red ? 'red' : ''}">${SUITS[m.suit]}${m.num}</div>` : ''}</div><div class="pvtxt"><h2>${esc(t.name)}</h2><div class="sub">${{ basic: 'ไพ่พื้นฐาน', trick: 'อุบาย', delayed: 'อุบายหน่วงเวลา', weapon: 'ยุทโธปกรณ์ · อาวุธ', armor: 'ยุทโธปกรณ์ · เกราะ', horse: 'ยุทโธปกรณ์ · ม้า' }[t.kind]}</div><p>${esc(t.desc)}</p></div></div>`; }
  if (m.type === 'discard') { const d = (S.view && S.view.discard) || []; body = `<h2>กองทิ้ง (${d.length} ใบ) — ใหม่สุดอยู่ซ้าย</h2><div class="cardrow">${d.slice().reverse().map((c) => cardEl(c, { sm: true, info: true })).join('') || '<span class="sub">ยังไม่มีไพ่ในกองทิ้ง</span>'}</div>`; }
  if (m.type === 'hero') { const h = HERO[m.id]; body = `<div class="row" style="align-items:flex-start;flex-wrap:nowrap"><div class="card lg" style="background-image:url(img/heroes/${h.id}.jpg)"></div><div><h2>${esc(h.name)}</h2><p class="sub">${FACTIONS[h.faction]} · พลังชีวิต ${h.hp} · ${h.gender === 'f' ? 'หญิง' : 'ชาย'}${h.lord ? ' · ขุนศึกจักรพรรดิ์' : ''}</p>${h.skills.map((s) => `<p><b style="color:var(--gold)">${esc(s[0])}</b><br>${esc(s[1])}</p>`).join('')}</div></div>`; }
  if (m.type === 'heroes') body = `<h2>ขุนศึกทั้งหมด (${HEROES.length})</h2><div class="items">${HEROES.map((h) => `<div class="item hero" data-hero-detail="${h.id}"><div class="hp" style="background-image:url(img/heroes/${h.id}.jpg)"></div><b>${esc(h.name)}</b> <span class="sub">${FACTIONS[h.faction]} ❤${h.hp}</span></div>`).join('')}</div>`;
  if (m.type === 'reveal') body = `<h2>${esc(m.title)}</h2><div class="cardrow">${m.cards.map((c) => cardEl(c, { sm: true })).join('') || '<span class="sub">ไม่มีไพ่</span>'}</div>`;
  if (m.type === 'rules') body = rulesHtml();
  return `<div class="ov" data-closemodal><div class="modal">${body}<div class="row" style="justify-content:center;margin-top:10px"><button data-a="closemodal" class="primary">ปิด</button></div></div></div>`;
}
function overModal() {
  const o = S.over;
  return `<div class="ov"><div class="modal"><h2>🏆 ${esc(o.winner.text)}</h2><div class="roles">${o.roles.map((r) => `<div class="${r.alive ? '' : 'dead'}"><b>${esc(r.name)}</b> — ${esc(HERO[r.hero].name)}<br><span style="color:var(--gold)">${ROLE_NAMES[r.role]}</span>${r.alive ? '' : ' ☠'}</div>`).join('')}</div><div class="row" style="justify-content:center"><button class="primary" data-a="backroom">กลับห้อง (เล่นใหม่)</button><button data-a="closeover">ดูโต๊ะต่อ</button><button class="danger" data-a="leave">ออกจากห้อง</button></div></div></div>`;
}
function rulesHtml() {
  const rows = Object.entries(ROLE_TABLE).map(([n, r]) => `<tr><td>${n}</td><td>1</td><td>${r.loyal}</td><td>${r.rebel}</td><td>${r.traitor}</td></tr>`).join('');
  return `<div class="rules"><h2>วิธีเล่น</h2>
  <h3>เป้าหมาย</h3><ul><li><b>จักรพรรดิ์</b>: กำจัดกบฎและทรยศ</li><li><b>ภักดี</b>: ปกป้องจักรพรรดิ์ กำจัดกบฎและทรยศ</li><li><b>กบฎ</b>: กำจัดจักรพรรดิ์</li><li><b>ทรยศ</b>: กำจัดทุกคน เหลือรอดคนสุดท้าย</li></ul>
  <p>ทุกคนซ่อนบทบาท มีแต่จักรพรรดิ์ที่เปิดเผย บทบาทของผู้ตายจะถูกเปิด กำจัดกบฎได้จั่วไพ่ 3 ใบ จักรพรรดิ์ฆ่าผู้ภักดีต้องทิ้งไพ่ทั้งหมด จักรพรรดิ์ตายขณะเหลือผู้เล่นมากกว่า 1 คน = กบฎชนะ (ยกเว้นทรยศรอดคนเดียว)</p>
  <table><tr><th>ผู้เล่น</th><th>จักรพรรดิ์</th><th>ภักดี</th><th>กบฎ</th><th>ทรยศ</th></tr>${rows}</table>
  <h3>ลำดับตา</h3><ol><li>ไพ่ตัดสินของ "มีสุขลืมเมือง" / "เรือระเบิดเพลิง" ที่ติดอยู่</li><li>จั่วไพ่ 2 ใบ</li><li>เล่นไพ่กี่ใบก็ได้ ("โจมตี" 1 ใบ/รอบ)</li><li>ทิ้งไพ่ให้เหลือเท่าพลังชีวิต</li></ol>
  <h3>ระยะ</h3><p>ทุกคนมีระยะโจมตี/อุบายเริ่มต้น 1 (ข้างเคียง) อาวุธ/ม้าเพิ่มระยะ นับระยะตามที่นั่งสั้นที่สุดของผู้ที่ยังมีชีวิต</p>
  <h3>พื้นฐาน</h3><ul><li><b>โจมตี</b> → เป้าหมายใช้ "ป้องกัน" หรือเสียพลังชีวิต 1</li><li><b>ฟื้นพลัง</b> → ใช้ในตาให้ใครก็ได้ (ไม่เกินพลังเต็ม) หรือช่วยผู้ที่พลังชีวิตเหลือ 0 ไม่ช่วย = ตาย</li></ul>
  <h3>ยกเลิกอุบาย</h3><p>เมื่ออุบายจะมีผลกับคุณ คุณมีช้อยใช้ "ยกเลิกอุบาย" ได้ ถ้าเป็นอุบายหลายคน (คนเถื่อน เกาทัณฑ์ โอสถสวรรค์ เก็บเกี่ยว) ทุกคนที่โดนจะได้ช้อยพร้อมกัน ใครใช้ก่อน ช้อยของคนอื่นจะหายและอุบายนั้นไม่มีผลกับทุกคน หากใช้กับ "เรือระเบิดเพลิง" เรือจะย้ายไปผู้เล่นถัดไปทันที</p>
  <h3>การควบคุม</h3><ul><li>คลิกไพ่ → เลือกวิธีใช้ → เลือกเป้าหมาย → ยืนยัน</li><li>คลิกรูปขุนศึกหรือชื่อยุทโธปกรณ์ เพื่อดูรายละเอียด/ทักษะ</li><li>ถ้าหมดเวลาตัดสินใจ 90 วินาที จะถือว่าจบตา/ไม่ใช้ไพ่</li><li>หวนอสรพิษ: มีปุ่มทักษะให้ใช้ไพ่ 2 ใบเป็น "โจมตี" ในตาของคุณ</li></ul></div>`;
}

// ---------- เหตุการณ์ ----------
document.addEventListener('click', (e) => {
  const t = e.target;
  const closer = t.closest('[data-closemodal]'); if (closer && t === closer) { S.modal = S.modal && S.modal.back ? S.modal.back : null; render(); return; }
  const ci = t.closest('[data-cinfo]'); if (ci) { const c = DECK[+ci.dataset.cinfo]; if (c) { S.modal = { type: 'card', key: c.key, suit: c.suit, num: c.num, back: S.modal && S.modal.type === 'discard' ? S.modal : null }; render(); return; } }
  const cd = t.closest('[data-card-detail]'); if (cd) { S.modal = { type: 'card', key: cd.dataset.cardDetail }; render(); return; }
  const hd = t.closest('[data-hero-detail]'); if (hd && !t.closest('.seat.targetable, .mehead.targetable')) { S.modal = { type: 'hero', id: hd.dataset.heroDetail }; render(); return; }
  const arr = t.closest('[data-arr]'); if (arr) { arrange(arr); return; }
  const pickEl = t.closest('[data-pick]'); if (pickEl) { togglePick(pickEl.dataset.pick); return; }
  const useEl = t.closest('[data-use]'); if (useEl) { chooseUse(+useEl.dataset.use); return; }
  const sk = t.closest('[data-skill]'); if (sk) { chooseSkill(sk.dataset.skill); return; }
  const cardEl_ = t.closest('#game .card[data-card]'); if (cardEl_ && !t.closest('.pile')) { if (cardClick(+cardEl_.dataset.card)) return; }
  const seat = t.closest('.seat[data-seat], .mehead[data-seat]'); if (seat && S.sel.targetable) { seatClick(+seat.dataset.seat); return; }
  const a = t.closest('[data-a]'); if (a) action(a.dataset.a, a);
});
document.addEventListener('contextmenu', (e) => { const c = e.target.closest('.card[data-key]'); if (c) { e.preventDefault(); S.modal = { type: 'card', key: c.dataset.key }; render(); } });
document.addEventListener('input', (e) => { if (e.target.id === 'name') { S.name = e.target.value; ls.set('sg_name', S.name); } if (e.target.id === 'code') S.joinCode = e.target.value.toUpperCase(); if (e.target.id === 'rtitle') S.rtitle = e.target.value; if (e.target.id === 'rpriv') S.rpriv = e.target.checked; });
document.addEventListener('change', (e) => { if (e.target.dataset.arr === 'b') arrange(e.target); });
let pressT;
document.addEventListener('touchstart', (e) => { const c = e.target.closest('.card[data-key]'); if (c) pressT = setTimeout(() => { S.modal = { type: 'card', key: c.dataset.key }; render(); }, 550); }, { passive: true });
document.addEventListener('touchend', () => clearTimeout(pressT)); document.addEventListener('touchmove', () => clearTimeout(pressT));

function arrange(el) {
  const o = S.sel.order, i = +el.dataset.i, k = el.dataset.arr;
  if (k === 'l' && i > 0) [o[i - 1], o[i]] = [o[i], o[i - 1]];
  if (k === 'r' && i < o.length - 1) [o[i + 1], o[i]] = [o[i], o[i + 1]];
  if (k === 'b') o[i].bottom = el.checked;
  render();
}
function togglePick(id) {
  const r = S.ask && S.ask.req; if (!r) return;
  const numeric = r.items.find((it) => String(it.id) === id).id; // คงชนิดตัวเลข/ข้อความตามต้นฉบับ
  const ids = S.sel.ids || (S.sel.ids = []);
  const i = ids.indexOf(numeric);
  if (i >= 0) ids.splice(i, 1); else { if (r.max === 1) ids.length = 0; if (ids.length < r.max) ids.push(numeric); }
  if (r.max === 1 && r.min === 1 && ids.length === 1 && r.kind !== 'hero' && r.kind !== 'zone' && r.kind !== 'cardpool') { answer([...ids]); return; }
  render();
}
function chooseUse(i) {
  const u = S.ask.req.uses[S.sel.card][i];
  S.sel.use = i; S.sel.targets = [];
  if (u.kind === 'none') { answer({ act: 'card', cardId: S.sel.card, as: u.as, targets: [] }); return; }
  S.sel.targetable = u.targets; render();
}
function chooseSkill(id) {
  const s = S.ask.req.skills.find((x) => x.id === id);
  if (S.sel.skill === id) { S.sel = {}; render(); return; }
  S.sel = { skill: id, skillCards: [], targets: [] };
  if (!s.sel.cards && !s.sel.targets) { answer({ act: 'skill', id, cardIds: [], targets: [] }); return; }
  if (s.sel.targets) S.sel.targetable = s.sel.targets.list;
  render();
}
function cardClick(id) {
  const a = S.ask; if (!a) return false; const r = a.req, sel = S.sel;
  if (r.type === 'play') {
    if (sel.skill) { const s = r.skills.find((x) => x.id === sel.skill); if (!s.sel.cards || !s.sel.cards.list.includes(id)) return true; const l = sel.skillCards; const i = l.indexOf(id); if (i >= 0) l.splice(i, 1); else if (l.length < s.sel.cards.max) l.push(id); render(); return true; }
    if (!r.uses[id]) return true;
    if (sel.card === id) { S.sel = {}; render(); return true; }
    S.sel = {}; S.preview = { id, mode: 'play' }; render();
    return true;
  }
  if (r.type === 'respond' || r.type === 'cards') {
    if (!(r.eligible.includes(id) || r.multi)) return true;
    const l = sel.cards || (sel.cards = []); const i = l.indexOf(id); const max = r.type === 'respond' ? (r.multi ? 2 : 1) : r.max;
    if (i >= 0) l.splice(i, 1); else { if (max === 1) l.length = 0; if (l.length < max) l.push(id); }
    if (r.type === 'respond' && !r.multi && l.length === 1) { l.length = 0; S.preview = { id, mode: 'respond' }; render(); return true; }
    render(); return true;
  }
  return false;
}
function seatClick(seat) {
  const sel = S.sel, r = S.ask && S.ask.req; if (!r || r.type !== 'play') return;
  let max, list = sel.targetable;
  if (sel.skill) { max = r.skills.find((x) => x.id === sel.skill).sel.targets.max; }
  else { const u = r.uses[sel.card][sel.use]; max = u.max; if (u.kind === 'pair') { if ((sel.targets || []).length === 0) { if (!u.targets.includes(seat)) return; sel.targets = [seat]; sel.targetable = u.victims[seat]; render(); return; } else { if (!u.victims[sel.targets[0]].includes(seat)) return; sel.targets.push(seat); render(); return; } } }
  const t = sel.targets || (sel.targets = []); if (!list.includes(seat)) return;
  const i = t.indexOf(seat); if (i >= 0) t.splice(i, 1); else { if (max === 1) t.length = 0; if (t.length < max) t.push(seat); }
  // เลือกเป้าหมายเดียว → ใช้ทันที (ยกเว้นทักษะที่ต้องเลือกไพ่เพิ่ม)
  if (!sel.skill && max === 1 && t.length === 1) { const u = r.uses[sel.card][sel.use]; answer({ act: 'card', cardId: sel.card, as: u.as, targets: [...t] }); return; }
  render();
}
function action(a, el) {
  const r = S.ask && S.ask.req, sel = S.sel;
  switch (a) {
    case 'create': send({ t: 'rename', name: S.name }); send({ t: 'create', title: (document.getElementById('rtitle') || {}).value || '', priv: !!(document.getElementById('rpriv') || {}).checked }); break;
    case 'joinroom': if (!S.name) return toast('ใส่ชื่อก่อน'); send({ t: 'rename', name: S.name }); send({ t: 'join', code: el.dataset.code }); break;
    case 'join': { const c = (document.getElementById('code').value || '').trim(); if (c.length < 4) return toast('กรอกรหัสห้อง 4 ตัว'); send({ t: 'rename', name: S.name }); send({ t: 'join', code: c }); break; }
    case 'copy': { const url = location.origin + '/?room=' + S.room.code; (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(() => toast('คัดลอกลิงก์แล้ว')).catch(() => toast('รหัสห้อง: ' + S.room.code)); break; }
    case 'addbot': send({ t: 'addbot' }); break;
    case 'rmbot': send({ t: 'rmbot', idx: +el.dataset.i }); break;
    case 'kick': send({ t: 'kick', idx: +el.dataset.i }); break;
    case 'start': send({ t: 'start' }); break;
    case 'leave': if (confirm('ออกจากห้อง?')) send({ t: 'leave' }); break;
    case 'leavegame': if (confirm('ออกจากเกม? (บอตจะเล่นแทนคุณ)')) send({ t: 'leave' }); break;
    case 'rules': S.modal = { type: 'rules' }; render(); break;
    case 'heroes': S.modal = { type: 'heroes' }; render(); break;
    case 'closemodal': S.modal = (S.modal && S.modal.back) || null; render(); break;
    case 'showdiscard': S.modal = { type: 'discard' }; render(); break;
    case 'drawpile': if (r && r.type === 'drawpile') answer(true); else toast(S.view && S.view.cur === S.view.you ? 'ยังไม่ถึงขั้นจั่วไพ่' : 'กองจั่ว — จะจั่วเมื่อถึงตาของคุณ'); break;
    case 'toptoggle': S.topHide = !S.topHide; try { localStorage.setItem('sg_tophide', S.topHide ? '1' : ''); } catch (e) {} render(); break;
    case 'handtoggle': S.handHide = !S.handHide; S.handHideAsk = S.handHide && S.ask ? S.ask.id : null; render(); break;
    case 'togglelog': if (matchMedia('(min-width:821px) and (min-height:521px)').matches) { S.logHide = !S.logHide; try { localStorage.setItem('sg_loghide', S.logHide ? '1' : ''); } catch (e) {} } else S.logOpen = !S.logOpen; render(); break;
    case 'roleok': answer(['ok']); break;
    case 'previewcancel': S.preview = null; S.sel = {}; render(); break;
    case 'previewok': { const pv = S.preview; S.preview = null; if (pv.mode === 'respond') { answer({ cardIds: [pv.id] }); break; } S.sel = { card: pv.id }; if (S.ask.req.uses[pv.id].length === 1) chooseUse(0); else render(); break; }
    case 'cancelsel': S.sel = {}; render(); break;
    case 'endturn': answer({ act: 'end' }); break;
    case 'usego': { const u = r.uses[sel.card][sel.use]; answer({ act: 'card', cardId: sel.card, as: u.as, targets: sel.targets }); break; }
    case 'skillgo': answer({ act: 'skill', id: sel.skill, cardIds: sel.skillCards || [], targets: sel.targets || [] }); break;
    case 'respgo': answer({ cardIds: sel.cards }); break;
    case 'armor': answer({ armor: true }); break;
    case 'help': answer({ help: true }); break;
    case 'pass': answer(null); break;
    case 'cardsgo': answer(sel.cards || []); break;
    case 'pass0': answer([]); break;
    case 'yes': answer(true); break;
    case 'no': answer(false); break;
    case 'pickgo': answer(sel.ids || []); break;
    case 'pickskip': answer([]); break;
    case 'arrgo': { const o = sel.order; answer({ top: o.filter((x) => !x.bottom).map((x) => x.c.id), bottom: o.filter((x) => x.bottom).map((x) => x.c.id) }); break; }
    case 'togglefx': window.SG_NOFX = !window.SG_NOFX; try { localStorage.setItem('sg_nofx', window.SG_NOFX ? '1' : ''); } catch (e) {} render(); break;
    case 'showover': S.showOver = true; render(); break;
    case 'closeover': S.showOver = false; S.over = null; render(); break;
    case 'backroom': S.over = null; S.showOver = false; S.view = null; S.room.state = 'lobby'; render(); break;
  }
}
// ข้อความ "ชนะ" แสดงโมดอลอัตโนมัติ


(function init() {
  const q = new URLSearchParams(location.search).get('room'); if (q) S.joinCode = q.toUpperCase();
  render(); connect();
  if (q) { const t = setInterval(() => { if (S.connected) { clearInterval(t); setTimeout(() => { if (!S.room && S.name) send({ t: 'join', code: q }); else if (!S.name) toast('ใส่ชื่อก่อน แล้วกด "เข้าห้อง"'); }, 300); } }, 200); }
})();

// ---------- โต๊ะกลาง / เอฟเฟกต์ ----------
const nmOf = (s) => (S.view && S.view.players[s]) ? `[${s + 1}] ${shortName(S.view.players[s].name)}` : '#' + (s + 1);
function centerHtml(v) {
  const draw = S.ask && S.ask.req.type === 'drawpile';
  const st = S.stage ? S.stage.items.map((it, i) => {
    const cards = it.cards.map((c) => cardEl(c, { sm: true, info: true })).join('');
    let cap;
    if (it.role === 'use') {
      const asn = it.as && it.as !== it.cards[0].key ? ` (เป็น ${CARD_TYPES[it.as].name})` : '';
      const tg = it.all ? (it.targets.length ? 'ทุกคน' : '') : it.targets.map(nmOf).join(', ');
      cap = `<b>${esc(nmOf(it.by))}</b> ใช้ ${esc(CARD_TYPES[it.cards[0].key].name)}${asn}${tg ? ` → ${esc(tg)}` : ''}`;
    } else cap = `<b>${esc(nmOf(it.by))}</b> ตอบด้วย ${esc(CARD_TYPES[it.need] ? CARD_TYPES[it.need].name : it.need)}${it.note ? ` (${esc(it.note)})` : ''}`;
    return `${i ? '<div class="sarrow">▶</div>' : ''}<div class="sitem ${it.role}">${cards}<div class="cap">${cap}</div></div>`;
  }).join('') : '<div class="sub" style="font-size:13px">การ์ดที่ใช้จะแสดงตรงนี้</div>';
  return `<div class="pile deckpile ${draw ? 'glow' : ''}" data-a="drawpile"><div class="card sm back"></div>กองจั่ว ${v.deck}</div>
    <div class="stage">${st}</div>
    <div class="pile" data-a="showdiscard" style="cursor:pointer">${v.discardTop ? cardEl(v.discardTop, { sm: true }) : '<div class="card sm empty"></div>'}กองทิ้ง ${v.discardN} 🔍</div>`;
}
function fxPop(html, ms, cls) {
  const root = $('#fx-root'); if (!root) return;
  const d = document.createElement('div'); d.className = 'fxp ' + (cls || ''); d.innerHTML = html; root.appendChild(d);
  setTimeout(() => { d.classList.add('out'); setTimeout(() => d.remove(), 400); }, ms);
}
function floatAt(seat, text, good) {
  if (!S.view) return;
  const el = seat === S.view.you ? $('.mehead') : $(`.seat[data-seat="${seat}"]`); const root = $('#fx-root'); if (!el || !root) return;
  const r = el.getBoundingClientRect(); const d = document.createElement('div'); d.className = 'flt ' + (good ? 'good' : 'bad'); d.textContent = text;
  d.style.left = (r.left + r.width / 2) + 'px'; d.style.top = (r.top + r.height / 3) + 'px'; root.appendChild(d); setTimeout(() => d.remove(), 1700);
}
function onFx(m) {
  const v = S.view; if (!v) return; const you = v.you;
  if (window.SGFX) setTimeout(() => SGFX.onFx(m, { you, nm: nmOf }), 30);
  switch (m.k) {
    case 'use': {
      S.stage = { items: [{ role: 'use', by: m.by, cards: m.cards, as: m.as, targets: m.targets, all: m.all }] }; S.lines = { by: m.by, as: m.as, targets: m.as === 'draw2' || m.as === 'fireboat' ? [] : m.targets, all: ['barbarians', 'arrows', 'peachGarden', 'harvest'].includes(m.as), until: Date.now() + 6000, resps: [] }; render(); setTimeout(drawLines, 6100);
      if (m.by !== you && m.targets.includes(you)) fxPop(`<div class="warn">⚠ ${esc(nmOf(m.by))} ใช้ <b>${esc(CARD_TYPES[m.as].name)}</b> ${m.all ? 'ใส่ทุกคน (รวมคุณ)' : 'ใส่คุณ'}!</div>${cardEl(m.cards[0], { sm: true, info: true })}`, 2300, 'target');
      break;
    }
    case 'resp': { if (S.lines && Date.now() < S.lines.until) { S.lines.resps.push({ from: m.by, need: m.need }); S.lines.until = Date.now() + 4500; setTimeout(drawLines, 4600); } if (!S.stage) S.stage = { items: [] }; S.stage.items.push({ role: 'resp', by: m.by, need: m.need, cards: m.cards, note: m.note }); render(); break; }
    case 'judge': fxPop(`<div class="jt">🎴 ไพ่ตัดสิน — ${esc(nmOf(m.by))}</div><div class="jr">${esc(m.reason)}${m.replacedBy !== undefined ? ` · ${esc(nmOf(m.replacedBy))} เปลี่ยนไพ่ตัดสิน` : ''}</div>${cardEl(m.cards ? m.cards[0] : m.card, { lg: true, info: true })}`, 2400, 'judge'); break;
    case 'got': fxPop(`<div class="jt">🂠 คุณได้ไพ่</div><div class="cardrow">${m.cards.map((c) => cardEl(c, { sm: true, info: true })).join('')}</div>`, 2800, 'got'); break;
    case 'hp': floatAt(m.seat, (m.d > 0 ? '+' : '') + m.d, m.d > 0); if (m.seat === you) fxPop(`<div class="warn ${m.d > 0 ? 'ok' : ''}">${m.d > 0 ? '💚 คุณฟื้นพลังชีวิต +' + m.d : '💥 คุณเสียพลังชีวิต ' + m.d}${m.from !== null && m.from !== undefined && m.from !== you ? ' (จาก ' + esc(nmOf(m.from)) + ')' : ''}</div>`, 1800, 'target'); break;
    case 'lose': {
      const who = m.seat === you ? 'ของคุณ' : `ของ ${esc(nmOf(m.seat))}`; const verb = m.how === 'steal' ? 'ถูกขโมย' : 'ถูกทำลาย';
      if (m.seat === you || m.by === you || m.card) fxPop(`<div class="${m.seat === you ? 'warn' : 'jt'}">${m.seat === you ? '⚠ ' : ''}ไพ่${who} ${verb} โดย ${esc(nmOf(m.by))}</div>${m.card ? cardEl(m.card, { sm: true, info: true }) : '<div class="card sm back"></div>'}`, 2400, m.seat === you ? 'target' : '');
      break;
    }
    case 'skill': fxPop(`<div class="${m.targets.includes(you) && m.by !== you ? 'warn' : 'jt'}">✦ ${esc(nmOf(m.by))} ใช้ทักษะ "${esc(m.name)}"${m.targets.length ? ' → ' + esc(m.targets.map(nmOf).join(', ')) : ''}</div>`, 2000, m.targets.includes(you) && m.by !== you ? 'target' : ''); break;
    case 'death': break;
    case 'note': fxPop(`<div class="jt">${esc(m.text)}</div>`, 2000); break;
  }
}

// ---------- เส้นชี้ผู้โจมตี → เป้าหมาย ----------
function seatPt(seat) {
  const el = document.querySelector(`[data-seat="${seat}"] .port`) || document.querySelector(`[data-seat="${seat}"]`); if (!el) return null;
  const r = el.getBoundingClientRect(); if (!r.width) return null;
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, r: Math.max(r.width, r.height) / 2 + 6 };
}
function drawLines() {
  let svg = document.getElementById('lines');
  if (!svg) { svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.id = 'lines'; document.body.appendChild(svg); }
  const L = S.lines;
  if (!L || Date.now() > L.until || !S.view || !document.getElementById('game')) { svg.innerHTML = ''; return; }
  const NS = 'http://www.w3.org/2000/svg'; let out = '';
  const arrow = (a, b, col, w, dash, label, op) => {
    const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy); if (len < 20) return '';
    const ux = dx / len, uy = dy / len;
    const x1 = a.x + ux * a.r, y1 = a.y + uy * a.r, x2 = b.x - ux * (b.r + 4), y2 = b.y - uy * (b.r + 4);
    const hx = 11 + w * 1.5, ang = Math.atan2(uy, ux);
    const p1 = [x2 - Math.cos(ang - 0.45) * hx, y2 - Math.sin(ang - 0.45) * hx], p2 = [x2 - Math.cos(ang + 0.45) * hx, y2 - Math.sin(ang + 0.45) * hx];
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
    return `<g opacity="${op || 1}" style="filter:drop-shadow(0 0 5px ${col})"><line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#000" stroke-opacity=".55" stroke-width="${w + 3}" stroke-linecap="round"/><line class="ln${dash ? ' dash' : ''}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${col}" stroke-width="${w}" stroke-linecap="round" ${dash ? 'stroke-dasharray="9 7"' : ''}/><polygon points="${x2},${y2} ${p1.join(',')} ${p2.join(',')}" fill="${col}" stroke="#000" stroke-opacity=".6" stroke-width="1.5"/>${label ? `<text x="${mx}" y="${my - 8}" text-anchor="middle" class="lnlbl">${label}</text>` : ''}</g>`;
  };
  const A = seatPt(L.by); if (!A) { svg.innerHTML = ''; return; }
  const name = (CARD_TYPES[L.as] || {}).name || '';
  const col = seatColor(L.by);
  const tg = L.all ? S.view.players.filter((p) => p.alive && p.seat !== L.by).map((p) => p.seat) : L.targets;
  tg.forEach((t, i) => { const B = seatPt(t); if (B) out += arrow(A, B, col, L.all ? 3 : 6, false, i === 0 || !L.all ? name : '', L.all ? 0.75 : 1); });
  (L.resps || []).forEach((r) => { const F = seatPt(r.from); if (F && F !== A) out += arrow(F, A, seatColor(r.from), 4, true, r.need === 'defend' ? 'ป้องกัน' : r.need === 'attack' ? 'โจมตีโต้' : r.need === 'nullify' ? 'ยกเลิก' : '', 0.9); });
  svg.innerHTML = out;
}
