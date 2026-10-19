'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { attach } = require('./ws.js');
const { Game } = require('./engine.js');
const bot = require('./bot.js');
const D = require('../shared/data.js');

const PUB = path.join(__dirname, '..', 'public');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  let url = decodeURIComponent((req.url || '/').split('?')[0]);
  if (url === '/') url = '/index.html';
  let file = url === '/data.js' ? path.join(__dirname, '..', 'shared', 'data.js') : path.join(PUB, url);
  if (!file.startsWith(PUB) && url !== '/data.js') { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': url.startsWith('/img/') ? 'public, max-age=86400' : 'no-cache' });
    res.end(buf);
  });
});

const rooms = new Map(); // code -> Room
const byUid = new Map(); // uid -> Room
const FAST = process.env.FAST === '1';
const ASK_TIMEOUT = +process.env.ASK_TIMEOUT || 90000;

const pubCard = (c) => c && ({ id: c.id, key: c.key, suit: c.suit, num: c.num, as: c.asKey || undefined });
const genCode = () => { const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let s; do { s = ''; for (let i = 0; i < 4; i++) s += A[Math.floor(Math.random() * A.length)]; } while (rooms.has(s)); return s; };

class Room {
  constructor(code, host) {
    this.code = code; this.members = []; this.state = 'lobby'; this.game = null; this.pending = new Map(); this.logs = []; this.hostUid = host; this.askId = 0; this.dead = false; this.botN = 0; this.lastWinner = null;
  }
  human(uid) { return this.members.find((m) => m.uid === uid); }
  send(m, obj) { if (m.conn && m.conn.open) m.conn.send(JSON.stringify(obj)); }
  broadcast(obj) { for (const m of this.members) if (!m.isBot) this.send(m, obj); }
  lobby() {
    return { t: 'room', code: this.code, state: this.state, host: this.hostUid, winner: this.lastWinner, members: this.members.map((m) => ({ uid: m.isBot ? null : m.uid, name: m.name, isBot: m.isBot, connected: m.isBot || !!(m.conn && m.conn.open), idx: this.members.indexOf(m) })) };
  }
  pushLobby() { const l = this.lobby(); for (const m of this.members) if (!m.isBot) this.send(m, { ...l, you: m.uid }); }
  hasHumanOnline() { return this.members.some((m) => !m.isBot && m.conn && m.conn.open); }

  // ----- มุมมองเกมเฉพาะผู้เล่นแต่ละคน -----
  view(seat) {
    const g = this.game; if (!g) return null;
    const over = !!g.winner;
    return {
      t: 'state', you: seat, round: g.round, cur: g.cur ? g.cur.seat : null, deck: g.deck.length,
      discardTop: g.discard.length ? pubCard(g.discard[g.discard.length - 1]) : null, discardN: g.discard.length,
      winner: g.winner, lordSeat: g.players.find((p) => p.role === 'lord').seat,
      players: g.players.map((p) => ({
        seat: p.seat, name: p.name, isBot: p.isBot, hero: p.hero && p.hero.id, hp: p.hp, maxHp: p.maxHp, hand: p.hand.length, alive: p.alive,
        role: (p.revealed || p.seat === seat || over) ? p.role : null,
        equip: { weapon: pubCard(p.equip.weapon), armor: pubCard(p.equip.armor), horse: pubCard(p.equip.horse) },
        delayed: p.delayed.map((c) => ({ key: c.asKey || c.key })),
        range: p.alive && p.hero ? g.attackRange(p) : 0,
      })),
      hand: g.players[seat].hand.map(pubCard),
    };
  }
  async pushState() {
    if (!this.game) return;
    for (const m of this.members) if (!m.isBot && m.conn && m.conn.open && m.seat !== undefined) this.send(m, this.view(m.seat));
  }
  pushLog(msg, priv) {
    const e = { msg, priv: priv || null, n: this.logs.length };
    this.logs.push(e); if (this.logs.length > 400) this.logs.shift();
    for (const m of this.members) if (!m.isBot && (!priv || priv.includes(m.seat))) this.send(m, { t: 'log', msg, priv: !!priv });
  }
  logsFor(seat) { return this.logs.filter((e) => !e.priv || e.priv.includes(seat)).slice(-120).map((e) => e.msg); }

  // ----- เริ่มเกม -----
  start() {
    if (this.state === 'playing') return;
    const n = this.members.length; if (n < 2 || n > 10) return;
    this.logs = []; this.lastWinner = null;
    const order = this.members.slice().sort(() => Math.random() - 0.5); // สุ่มที่นั่ง
    order.forEach((m, i) => { m.seat = i; m.timeouts = 0; m.auto = false; });
    this.state = 'playing';
    const room = this;
    const io = {
      log: (m, priv) => room.pushLog(m, priv),
      sync: () => room.pushState(),
      pause: (ms) => (FAST || !room.hasHumanOnline() ? Promise.resolve() : new Promise((r) => setTimeout(r, ms))),
      reveal: (seat, title, ids) => { const m = order[seat]; if (m && !m.isBot) room.send(m, { t: 'reveal', title, cards: ids.map((id) => pubCard(room.game.getCard(id))) }); },
      ask: (seat, req) => room.ask(order[seat], seat, req),
    };
    this.game = new Game({ io, players: order.map((m) => ({ name: m.name, isBot: m.isBot, uid: m.uid })) });
    this.pushLobby();
    this.game.run().then((w) => {
      this.state = 'ended'; this.lastWinner = w;
      const roles = this.game.players.map((p) => ({ seat: p.seat, name: p.name, hero: p.hero.id, role: p.role, alive: p.alive }));
      this.broadcast({ t: 'over', winner: w, roles }); this.pushState(); this.pushLobby();
    }).catch((e) => { if (!this.dead) { console.error('game error', e); this.pushLog('เกิดข้อผิดพลาดในเกม: ' + e.message); } this.state = 'ended'; this.pushLobby(); });
  }
  sanitize(req) {
    const g = this.game; const out = {};
    for (const k of ['type', 'prompt', 'kind', 'need', 'multi', 'canArmor', 'canHelp', 'helpLabel', 'min', 'max', 'eligible', 'uses', 'skills', 'items', 'cards']) if (req[k] !== undefined) out[k] = req[k];
    if (req.ctx) { out.ctx = {}; for (const [k, v] of Object.entries(req.ctx)) if (v === null || ['number', 'string', 'boolean'].includes(typeof v) || (Array.isArray(v) && v.every((x) => typeof x === 'number'))) out.ctx[k] = v; }
    if (req.type === 'arrange') out.cardsPub = req.cards.map((id) => pubCard(g.getCard(id)));
    if (req.type === 'pick' && req.items) out.items = req.items.map((i) => ({ ...i, card: i.cardId ? pubCard(g.getCard(i.cardId)) : undefined }));
    if (req.ctx && req.ctx.judge) out.ctx.judgeCard = pubCard(g.getCard(req.ctx.judge.card));
    return out;
  }
  ask(m, seat, req) {
    if (this.dead) return Promise.reject(new Error('aborted'));
    const g = this.game, p = g.players[seat];
    const botAns = () => bot.decide(g, seat, req);
    const online = !m.isBot && m.conn && m.conn.open && !m.auto;
    if (!online) {
      const wait = FAST || !this.hasHumanOnline() ? 0 : (req.type === 'play' ? 900 : 450);
      return new Promise((res, rej) => setTimeout(() => { if (this.dead) rej(new Error('aborted')); else res(botAns()); }, wait));
    }
    return new Promise((resolve, reject) => {
      const id = ++this.askId;
      const timer = setTimeout(() => { this.pending.delete(seat); m.timeouts = (m.timeouts || 0) + 1; this.pushLog(`${m.name} หมดเวลา — บอตตัดสินใจแทน`); if (m.timeouts >= 2) { m.auto = true; this.pushLog(`${m.name} ถูกบอตเล่นแทน (กด "กลับมาเล่น" เพื่อเล่นต่อ)`); } resolve(botAns()); }, ASK_TIMEOUT);
      this.pending.set(seat, { id, req, resolve, reject, timer, m });
      this.send(m, { t: 'ask', id, req: this.sanitize(req), deadline: Date.now() + ASK_TIMEOUT });
    });
  }
  answer(m, id, ans) {
    const pd = this.pending.get(m.seat);
    if (!pd || pd.id !== id) return;
    clearTimeout(pd.timer); this.pending.delete(m.seat); m.timeouts = 0;
    pd.resolve(ans === undefined ? null : ans);
  }
  resendAsk(m) {
    const pd = this.pending.get(m.seat);
    if (pd) this.send(m, { t: 'ask', id: pd.id, req: this.sanitize(pd.req), deadline: Date.now() + ASK_TIMEOUT });
  }
  abort() { this.dead = true; for (const pd of this.pending.values()) { clearTimeout(pd.timer); pd.reject(new Error('aborted')); } this.pending.clear(); }
}

function handleMsg(conn, raw) {
  let msg; try { msg = JSON.parse(raw); } catch (e) { return; }
  const send = (o) => conn.send(JSON.stringify(o));
  if (msg.t === 'hello') {
    const uid = String(msg.uid || '').slice(0, 40); if (!uid) return;
    conn.uid = uid; conn.name = String(msg.name || '').trim().slice(0, 16) || 'ผู้เล่น';
    const room = byUid.get(uid);
    if (room) {
      const m = room.human(uid);
      if (m) { m.conn = conn; if (msg.name) m.name = conn.name; room.pushLobby(); if (room.game) { m.auto = false; send(room.view(m.seat)); send({ t: 'logs', logs: room.logsFor(m.seat) }); room.resendAsk(m); if (room.state === 'ended' && room.lastWinner) send({ t: 'over', winner: room.lastWinner, roles: room.game.players.map((p) => ({ seat: p.seat, name: p.name, hero: p.hero.id, role: p.role, alive: p.alive })) }); } return; }
    }
    send({ t: 'welcome' }); return;
  }
  if (!conn.uid) return;
  const uid = conn.uid; let room = byUid.get(uid);
  switch (msg.t) {
    case 'rename': { const n = String(msg.name || '').trim().slice(0, 16); if (n) { conn.name = n; if (room) { const m = room.human(uid); if (m) { m.name = n; room.pushLobby(); } } } break; }
    case 'create': {
      if (room) leave(room, uid);
      const r = new Room(genCode(), uid); rooms.set(r.code, r); byUid.set(uid, r);
      r.members.push({ uid, name: conn.name, isBot: false, conn }); r.pushLobby(); break;
    }
    case 'join': {
      const code = String(msg.code || '').toUpperCase().trim(); const r = rooms.get(code);
      if (!r) return send({ t: 'err', msg: 'ไม่พบห้อง ' + code });
      if (r.state === 'playing') return send({ t: 'err', msg: 'ห้องนี้กำลังเล่นอยู่' });
      if (r.members.length >= 10) return send({ t: 'err', msg: 'ห้องเต็ม (สูงสุด 10 คน)' });
      if (room && room !== r) leave(room, uid);
      if (!r.human(uid)) { r.members.push({ uid, name: conn.name, isBot: false, conn }); byUid.set(uid, r); if (r.state === 'ended') r.state = 'lobby'; }
      r.pushLobby(); break;
    }
    case 'leave': if (room) leave(room, uid); send({ t: 'left' }); break;
    case 'addbot': if (room && room.hostUid === uid && room.state !== 'playing' && room.members.length < 10) { room.botN++; room.members.push({ uid: 'bot' + room.botN, name: 'บอต ' + room.botN, isBot: true }); if (room.state === 'ended') room.state = 'lobby'; room.pushLobby(); } break;
    case 'rmbot': if (room && room.hostUid === uid && room.state !== 'playing') { const i = room.members.findIndex((m) => m.isBot && room.members.indexOf(m) === msg.idx); if (i >= 0) room.members.splice(i, 1); room.pushLobby(); } break;
    case 'kick': if (room && room.hostUid === uid && room.state !== 'playing') { const m = room.members[msg.idx]; if (m && !m.isBot && m.uid !== uid) { byUid.delete(m.uid); room.members.splice(room.members.indexOf(m), 1); if (m.conn) m.conn.send(JSON.stringify({ t: 'left' })); room.pushLobby(); } } break;
    case 'start': if (room && room.hostUid === uid && room.state !== 'playing') { if (room.members.length < 2) return send({ t: 'err', msg: 'ต้องมีผู้เล่นอย่างน้อย 2 คน (เพิ่มบอตได้)' }); room.start(); } break;
    case 'answer': if (room && room.state === 'playing') { const m = room.human(uid); if (m) room.answer(m, msg.id, msg.ans); } break;
    case 'resume': if (room && room.state === 'playing') { const m = room.human(uid); if (m) { m.auto = false; m.timeouts = 0; room.pushLog(`${m.name} กลับมาเล่นต่อ`); } } break;
  }
}
function leave(room, uid) {
  const m = room.human(uid); byUid.delete(uid);
  if (!m) return;
  if (room.state === 'playing') { m.conn = null; m.isBot = true; m.name = m.name + ' (บอต)'; room.pushLog(`${m.name} ออกจากเกม — บอตเล่นแทน`); if (room.game) room.game.players[m.seat].isBot = true; }
  else room.members.splice(room.members.indexOf(m), 1);
  if (!room.members.some((x) => !x.isBot)) { room.abort(); rooms.delete(room.code); return; }
  if (room.hostUid === uid) room.hostUid = room.members.find((x) => !x.isBot).uid;
  room.pushLobby();
}

attach(server, (conn) => {
  conn.on('message', (m) => { try { handleMsg(conn, m); } catch (e) { console.error(e); } });
  conn.on('close', () => { const room = conn.uid && byUid.get(conn.uid); if (room) { const m = room.human(conn.uid); if (m && m.conn === conn) { m.conn = null; room.pushLobby(); if (room.state !== 'playing') { /* ค้างห้องไว้ รอเชื่อมต่อใหม่ */ } } } });
});
setInterval(() => { // keepalive + เก็บห้องร้าง
  for (const room of rooms.values()) for (const m of room.members) if (m.conn && m.conn.open) { if (!m.conn.alive) m.conn.close(); else m.conn.ping(); }
  for (const [code, room] of rooms) if (!room.hasHumanOnline() && Date.now() - (room.idleSince = room.idleSince || Date.now()) > 30 * 60 * 1000) { room.abort(); rooms.delete(code); for (const m of room.members) byUid.delete(m.uid); }
  for (const room of rooms.values()) if (room.hasHumanOnline()) room.idleSince = 0;
}, 25000).unref();

const PORT = +process.env.PORT || 3000;
if (require.main === module) server.listen(PORT, () => console.log(`สามก๊กกลยุทธ์ เปิดที่ http://localhost:${PORT}`));
module.exports = { server, rooms };
