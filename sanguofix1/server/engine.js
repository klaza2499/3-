'use strict';
// กติกาเกม สามก๊กกลยุทธ์ — เอนจินแบบ async: ทุกการตัดสินใจ = await io.ask(seat, req)
const D = require('../shared/data.js');
const { CARD_TYPES, SUITS, isRed } = D;

class Invalid extends Error {}
class GameOver extends Error {}

const cname = (c) => `${CARD_TYPES[c.key].name}${SUITS[c.suit]}${c.num}`;
const isBlack = (s) => s === 'T' || s === 'X';

class Game {
  constructor(opts) {
    this.io = opts.io;
    let s = (opts.seed ?? Date.now()) >>> 0;
    this.rng = () => { s |= 0; s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    this.defs = opts.players; // [{name,isBot,uid}]
    this.players = []; this.deck = []; this.discard = []; this.cardById = {};
    this.winner = null; this.cur = null; this.round = 0; this.ts = {};
    this.heroPool = opts.heroPool || null;
  }
  // ---------- ยูทิลิตี้ ----------
  shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(this.rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  log(m, priv) { this.io.log && this.io.log(m, priv); }
  async sync() { if (this.io.sync) await this.io.sync(); }
  async ask(p, req) { await this.sync(); return this.io.ask(p.seat, req); }
  async pause(ms) { if (this.io.pause) await this.io.pause(ms); }
  alive() { return this.players.filter((p) => p.alive); }
  others(p) { return this.alive().filter((q) => q !== p); }
  nextAlive(p) { const n = this.players.length; for (let i = 1; i <= n; i++) { const q = this.players[(p.seat + i) % n]; if (q.alive) return q; } return p; }
  order(from) { // ผู้เล่นที่ยังอยู่ เริ่มจาก from วนตามเข็ม
    const n = this.players.length, r = [];
    for (let i = 0; i < n; i++) { const q = this.players[(from.seat + i) % n]; if (q.alive) r.push(q); }
    return r;
  }
  dist(a, b) { const al = this.alive(); const d = Math.abs(al.indexOf(a) - al.indexOf(b)); return Math.min(d, al.length - d); }
  attackRange(p) { return 1 + (p.equip.weapon ? p.equip.weapon.def.atk : 0) + (p.equip.horse ? p.equip.horse.def.atk : 0) + (p.hero.id === 'machao' ? 1 : 0); }
  trickRange(p) { return 1 + (p.equip.horse ? p.equip.horse.def.trick : 0) + (p.hero.id === 'machao' ? 1 : 0); }
  inAtkRange(a, b) { return a !== b && a.alive && b.alive && this.dist(a, b) <= this.attackRange(a); }
  maxHp(p) { return p.maxHp; }
  heroIs(p, id) { return p.hero && p.hero.id === id && p.alive; }
  isMale(p) { return p.hero.gender === 'm'; }
  nCards(p) { return p.hand.length + Object.values(p.equip).filter(Boolean).length; }

  // ---------- กองไพ่ ----------
  makeDeck() {
    this.deck = D.buildDeck().map((c) => { c.def = CARD_TYPES[c.key]; this.cardById[c.id] = c; return c; });
    this.shuffle(this.deck);
  }
  refill(n) {
    if (this.deck.length < n && this.discard.length) { this.deck = this.deck.concat(this.shuffle(this.discard)); this.discard = []; this.log('สับกองทิ้งกลับเป็นกองจั่ว'); }
  }
  drawOne() { this.refill(1); return this.deck.shift() || null; }
  draw(p, n, quiet) {
    const got = [];
    for (let i = 0; i < n; i++) { const c = this.drawOne(); if (!c) break; p.hand.push(c); got.push(c); }
    if (!quiet && got.length) this.log(`${p.name} จั่วไพ่ ${got.length} ใบ`);
    return got;
  }
  toDiscard(c) { if (c) this.discard.push(c); }
  removeHand(p, c) {
    const i = p.hand.indexOf(c); if (i < 0) throw new Invalid('ไม่มีไพ่ใบนี้ในมือ');
    p.hand.splice(i, 1); this.emptyCheck(p);
  }
  emptyCheck(p) { if (p.alive && p.hand.length === 0 && p.hero.id === 'lusu' && !this.ts.noLusu) { this.log(`${p.name} ไม่มีไพ่ในมือ (มีไม่มี) จั่ว 1 ใบ`); this.draw(p, 1, true); } }
  dropHand(p, cards) { for (const c of cards) { this.removeHand(p, c); this.toDiscard(c); } }
  equipLost(p) { if (p.alive && p.hero.id === 'sunshangxiang') { this.log(`${p.name} (สับเปลี่ยนศาสตรา) จั่ว 2 ใบ`); this.draw(p, 2, true); } }
  dropEquip(p, slot) { const c = p.equip[slot]; if (!c) return null; p.equip[slot] = null; this.toDiscard(c); this.equipLost(p); return c; }
  getCard(id) { return this.cardById[id]; }
  handCards(p, ids) {
    const cs = (ids || []).map((id) => p.hand.find((c) => c.id === id));
    if (cs.some((c) => !c) || new Set(ids).size !== ids.length) throw new Invalid('ไพ่ไม่ถูกต้อง');
    return cs;
  }

  // ---------- เริ่มเกม ----------
  async setup() {
    const n = this.defs.length;
    const tbl = D.ROLE_TABLE[n]; if (!tbl) throw new Error('ต้องมีผู้เล่น 2-10 คน');
    const roles = ['lord'];
    for (const k of ['loyal', 'rebel', 'traitor']) for (let i = 0; i < tbl[k]; i++) roles.push(k);
    this.shuffle(roles);
    this.players = this.defs.map((d, i) => ({
      seat: i, name: `[${i + 1}] ${d.name}`, isBot: !!d.isBot, uid: d.uid, role: roles[i], hero: null, hp: 0, maxHp: 0,
      hand: [], equip: { weapon: null, armor: null, horse: null }, delayed: [], alive: true, revealed: roles[i] === 'lord',
      evidence: { hostileTo: {}, helped: {} },
    }));
    this.makeDeck();
    const lord = this.players.find((p) => p.role === 'lord');
    this.log(`เริ่มเกม ${n} คน — จักรพรรดิ์คือ ${lord.name}`);
    // แจ้งบทบาทให้ทุกคนทราบก่อนเลือกขุนศึก
    const need = D.ROLE_TABLE[n];
    const counts = `จักรพรรดิ์ 1 · ภักดี ${need.loyal} · กบฎ ${need.rebel} · ทรยศ ${need.traitor}`;
    await Promise.all(this.players.map((p) => this.io.ask(p.seat, {
      type: 'pick', kind: 'role', prompt: `คุณนั่งที่ตำแหน่ง ${p.seat + 1} — บทบาทของคุณคือ`, items: [{ id: 'ok', label: 'รับทราบ' }], min: 1, max: 1,
      ctx: { role: p.role, seatNo: p.seat + 1, lordName: lord.name, counts },
    })));
    // เลือกขุนศึก
    const heroes = D.HEROES;
    const lordHeroes = heroes.filter((h) => h.lord), normal = this.shuffle(heroes.filter((h) => !h.lord).slice());
    const extra = normal.splice(0, 2);
    const lordPool = [...lordHeroes, ...extra];
    const pickHero = async (p, pool, prompt) => {
      const ans = await this.io.ask(p.seat, { type: 'pick', kind: 'hero', prompt, items: pool.map((h) => ({ id: h.id, hero: h.id, label: h.name })), min: 1, max: 1 });
      const id = Array.isArray(ans) ? ans[0] : null;
      return pool.find((h) => h.id === id) || pool[0];
    };
    const lh = await pickHero(lord, lordPool, 'เลือกขุนศึกของคุณ (จักรพรรดิ์)');
    this.setHero(lord, lh, true, n);
    this.log(`${lord.name} เลือก ${lh.name}`);
    await this.sync();
    // ขุนศึกที่จักรพรรดิ์ไม่ได้เลือกกลับเข้าพูล แล้วสุ่มแจกให้ผู้เล่นอื่น
    const rest = this.shuffle(heroes.filter((h) => h !== lh));
    const per = n > 8 ? 2 : 3;
    const others = this.players.filter((p) => p !== lord);
    const pools = others.map((p) => rest.splice(0, per));
    const chosen = await Promise.all(others.map((p, i) => pickHero(p, pools[i], 'เลือกขุนศึกของคุณ')));
    others.forEach((p, i) => this.setHero(p, chosen[i], false, n));
    for (const p of this.players) this.draw(p, 4, true);
    await this.sync();
  }
  setHero(p, h, isLord, n) { p.hero = h; p.maxHp = h.hp + (isLord && n >= 4 ? 1 : 0); p.hp = p.maxHp; }

  async run() {
    try {
      await this.setup();
      const lord = this.players.find((p) => p.role === 'lord');
      let p = lord;
      for (;;) {
        if (p.alive) { this.round++; await this.takeTurn(p); }
        p = this.nextAlive(p);
        if (this.round > 400) { this.winner = { side: 'draw', text: 'เสมอ (เล่นนานเกินไป)' }; throw new GameOver(); }
      }
    } catch (e) {
      if (!(e instanceof GameOver)) throw e;
    }
    await this.sync();
    return this.winner;
  }
  checkWin() {
    if (this.winner) return;
    const al = this.alive(), lord = this.players.find((p) => p.role === 'lord');
    let w = null;
    if (!lord.alive) {
      if (al.length === 1 && al[0].role === 'traitor') w = { side: 'traitor', text: 'ฝ่าย "ทรยศ" ชนะ!' };
      else w = { side: 'rebel', text: 'ฝ่าย "กบฎ" ชนะ!' };
    } else if (al.every((p) => p.role === 'lord' || p.role === 'loyal')) w = { side: 'lord', text: 'ฝ่าย "จักรพรรดิ์และภักดี" ชนะ!' };
    if (w) { this.winner = w; this.log('จบเกม — ' + w.text); throw new GameOver(); }
  }

  // ---------- ลำดับตา ----------
  async takeTurn(p) {
    this.cur = p; this.ts = { attacks: 0, attacked: false, skills: {}, sniper: false, rendeGiven: 0, rendeHealed: false, noLusu: false };
    this.log(`── ตาของ ${p.name} (${p.hero.name}) ──`);
    let skipPlay = false;
    // ขั้นไพ่ตัดสิน
    while (p.alive && p.delayed.length) {
      const c = p.delayed.pop(); const k = c.asKey || c.key; c.asKey = undefined;
      if (await this.tryNullify(p, { key: k })) {
        this.log(`${p.name} ใช้ ยกเลิกอุบาย กับ ${CARD_TYPES[k].name}`);
        if (k === 'fireboat') { c.asKey = k; this.passFireboat(p, c); } else this.toDiscard(c);
        continue;
      }
      if (k === 'indulgence') {
        const j = await this.judge(p, 'มีสุขลืมเมือง', (x) => x.suit === 'C');
        if (j.suit !== 'C') { skipPlay = true; this.log(`${p.name} ติด มีสุขลืมเมือง ข้ามการเล่นไพ่`); }
        this.toDiscard(c);
      } else if (k === 'fireboat') {
        const j = await this.judge(p, 'เรือระเบิดเพลิง', (x) => !(x.suit === 'T' && x.num >= 2 && x.num <= 9));
        if (j.suit === 'T' && j.num >= 2 && j.num <= 9) { this.log(`เรือระเบิดเพลิงระเบิดใส่ ${p.name}!`); this.toDiscard(c); await this.damage(null, p, 3, { type: 'fire' }); }
        else { c.asKey = k; this.passFireboat(p, c); }
      }
    }
    if (!p.alive) return;
    await this.drawPhase(p);
    if (!p.alive) return;
    if (!skipPlay) await this.playPhase(p);
    if (!p.alive) return;
    await this.discardPhase(p);
    if (p.alive && p.hero.id === 'diaochan') { this.log(`${p.name} (เสน่ห์เงาจันทร์) จั่ว 1 ใบ`); this.draw(p, 1, true); }
  }
  passFireboat(p, c) {
    const nx = this.nextAlive(p);
    if (nx === p) { p.delayed.push(c); return; }
    nx.delayed.push(c); this.log(`เรือระเบิดเพลิงย้ายไปที่ ${nx.name}`);
  }
  async drawPhase(p) {
    const id = p.hero.id; let n = id === 'zhouyu' ? 3 : 2;
    if (id === 'zhugeliang') {
      const k = Math.min(5, this.alive().length);
      this.refill(k);
      const top = this.deck.slice(0, k);
      if (top.length > 1) {
        const ans = await this.ask(p, { type: 'arrange', prompt: 'หยั่งรู้ฟ้าดิน: เรียงไพ่บนกอง (ซ้ายสุด = จั่วก่อน) หรือใส่ไว้ใต้กอง', cards: top.map((c) => c.id) });
        if (ans && Array.isArray(ans.top) && Array.isArray(ans.bottom)) {
          const all = [...ans.top, ...ans.bottom];
          if (all.length === top.length && top.every((c) => all.includes(c.id))) {
            this.deck.splice(0, k);
            this.deck.unshift(...ans.top.map((i) => this.getCard(i)));
            this.deck.push(...ans.bottom.map((i) => this.getCard(i)));
            this.log(`${p.name} (หยั่งรู้ฟ้าดิน) จัดเรียงไพ่บนกอง`);
          }
        }
      }
    }
    if (id === 'zhangliao') {
      const ts = this.others(p).filter((q) => q.hand.length);
      if (ts.length) {
        const ans = await this.ask(p, { type: 'pick', kind: 'seat', prompt: 'ลักชื่อเปลี่ยนเสา: เลือกผู้เล่นที่จะขโมยไพ่ (สูงสุด 2 คน) หรือข้ามเพื่อจั่วปกติ', items: ts.map((q) => ({ id: q.seat, label: q.name })), min: 0, max: 2 });
        const sel = (Array.isArray(ans) ? ans : []).map((s) => this.players[s]).filter((q) => ts.includes(q)).slice(0, 2);
        if (sel.length) {
          for (const q of sel) if (q.hand.length) { const c = q.hand[Math.floor(this.rng() * q.hand.length)]; this.removeHand(q, c); p.hand.push(c); }
          this.log(`${p.name} (ลักชื่อเปลี่ยนเสา) ขโมยไพ่จาก ${sel.map((q) => q.name).join(', ')}`);
          return;
        }
      }
    }
    if (id === 'zhenji') {
      if (await this.yesno(p, 'แล้วแต่สวรรค์: จั่วไพ่ทีละใบจนกว่าจะได้ ● หรือ ■ ?', true)) {
        for (let i = 0; i < 30; i++) {
          const c = this.drawOne(); if (!c) break; p.hand.push(c); this.log(`${p.name} (แล้วแต่สวรรค์) จั่วได้ ${cname(c)}`);
          if (isRed(c.suit)) break;
        }
      }
    }
    if (id === 'huaxiong') {
      if (await this.yesno(p, 'สังหารพญาเสือ: จั่วไพ่เพียง 1 ใบ เพื่อให้ "โจมตี/ท้าสู้" ที่สำเร็จทำความเสียหาย 2 ?', false)) { n = 1; this.ts.sniper = true; }
    }
    this.draw(p, n);
  }
  async discardPhase(p) {
    let limit = p.hp;
    if (p.hero.id === 'dongzhuo') limit += this.alive().filter((q) => q.hero.faction === 'free').length;
    if (p.hero.id === 'lvmeng' && !this.ts.attacked) limit = 999;
    const over = p.hand.length - limit;
    if (over <= 0) return;
    const ans = await this.ask(p, { type: 'cards', prompt: `ทิ้งไพ่ในมือ ${over} ใบ (ถือได้ ${limit} ใบ)`, eligible: p.hand.map((c) => c.id), min: over, max: over, ctx: { reason: 'limit' } });
    let cs;
    try { cs = this.handCards(p, ans); if (cs.length !== over) throw new Invalid(); } catch (e) { cs = p.hand.slice(0, over); }
    this.log(`${p.name} ทิ้งไพ่ ${over} ใบ`); this.ts.noLusu = false; this.dropHand(p, cs);
  }

  // ---------- ไพ่ตัดสิน ----------
  async judge(p, reason, good) {
    const c = this.drawOne();
    if (!c) return { suit: 'X', num: 0, key: 'none' };
    this.log(`${p.name} จั่วไพ่ตัดสิน (${reason}) ได้ ${cname(c)}`);
    let card = c, toDisc = [c];
    for (const q of this.order(p)) {
      if (q.hero.id !== 'simayi' || !q.hand.length) continue;
      const ans = await this.ask(q, { type: 'cards', prompt: `สับเปลี่ยนวิญญาณ: ไพ่ตัดสินของ ${p.name} (${reason}) คือ ${cname(card)} — เปลี่ยนด้วยไพ่ในมือ?`, eligible: q.hand.map((x) => x.id), min: 0, max: 1, ctx: { judge: { owner: p.seat, card: card.id, good: good ? 'fn' : null }, judgeFn: good, judgeOwner: p } });
      if (Array.isArray(ans) && ans.length === 1) {
        const rc = q.hand.find((x) => x.id === ans[0]);
        if (rc) { this.removeHand(q, rc); this.log(`${q.name} (สับเปลี่ยนวิญญาณ) เปลี่ยนไพ่ตัดสินเป็น ${cname(rc)}`); toDisc.push(rc); card = rc; }
      }
    }
    const result = { suit: card.suit, num: card.num, key: card.key };
    if (p.hero.id === 'guojia' && p.alive && toDisc.includes(card)) {
      if (await this.yesno(p, `จูงแพะติดมือ: เก็บไพ่ตัดสิน ${cname(card)} ขึ้นมือ?`, true)) { p.hand.push(card); toDisc = toDisc.filter((x) => x !== card); this.log(`${p.name} (จูงแพะติดมือ) เก็บไพ่ตัดสิน`); }
    }
    toDisc.forEach((x) => this.toDiscard(x));
    return result;
  }
  async yesno(p, prompt, botDefault) { const a = await this.ask(p, { type: 'yesno', prompt, botDefault: !!botDefault }); return !!a; }

  // ---------- ความเสียหาย / ตาย ----------
  async damage(src, tgt, n, ctx = {}) {
    if (!tgt.alive || n <= 0) return;
    tgt.hp -= n;
    this.log(`${tgt.name} เสียพลังชีวิต ${n} หน่วย${src && src !== tgt ? ` (จาก ${src.name})` : ''} เหลือ ${tgt.hp}`);
    if (src && src !== tgt) this.noteHostile(src, tgt, ctx);
    if (src && src.alive && src.hero.id === 'dongzhuo' && this.cur === src && (ctx.type === 'attack' || ctx.type === 'duel')) {
      const h = Math.min(n, src.maxHp - src.hp); if (h > 0) { src.hp += h; this.log(`${src.name} (สูบเลือด) ฟื้นพลังชีวิต ${h}`); }
    }
    if (tgt.hp <= 0) { const saved = await this.dying(tgt, src); if (!saved) { await this.kill(tgt, src); return; } }
    if (!tgt.alive) return;
    await this.afterDamage(src, tgt, n, ctx);
  }
  noteHostile(src, tgt, ctx) { // บันทึกให้บอตเดาบทบาท
    if (ctx.type === 'attack' || ctx.type === 'duel' || ctx.type === 'trick') { this.attackLog = this.attackLog || {}; const k = src.seat + '>' + tgt.seat; this.attackLog[k] = (this.attackLog[k] || 0) + 1; }
  }
  async afterDamage(src, tgt, n, ctx) {
    const id = tgt.hero.id;
    if (id === 'guojia') {
      for (let i = 0; i < n && tgt.alive; i++) {
        const cs = this.draw(tgt, 2, true); this.log(`${tgt.name} (วิกฤตคือโอกาส) จั่ว 2 ใบ`);
        const others = this.others(tgt);
        if (cs.length && others.length) {
          const ans = await this.ask(tgt, { type: 'pick', kind: 'seat', prompt: 'วิกฤตคือโอกาส: มอบไพ่ที่จั่วให้ใคร? (ไม่เลือก = เก็บไว้เอง)', items: others.map((q) => ({ id: q.seat, label: q.name })), min: 0, max: 1, ctx: { give: cs.map((c) => c.id) } });
          const t = Array.isArray(ans) && ans.length ? this.players[ans[0]] : null;
          if (t && t.alive && t !== tgt) {
            const give = await this.ask(tgt, { type: 'cards', prompt: `เลือกไพ่ที่จะมอบให้ ${t.name}`, eligible: cs.filter((c) => tgt.hand.includes(c)).map((c) => c.id), min: 0, max: 2, ctx: { give: true, to: t.seat } });
            const gs = (Array.isArray(give) ? give : []).map((i) => tgt.hand.find((c) => c.id === i)).filter(Boolean);
            for (const g of gs) { this.removeHand(tgt, g); t.hand.push(g); }
            if (gs.length) this.log(`${tgt.name} มอบไพ่ ${gs.length} ใบให้ ${t.name}`);
          }
        }
      }
    }
    if (id === 'caocao' && ctx.cause) {
      const got = ctx.cause.filter((c) => { const i = this.discard.indexOf(c); if (i >= 0) { this.discard.splice(i, 1); return true; } return false; });
      if (got.length) { tgt.hand.push(...got); this.log(`${tgt.name} (ทรยศคนทั้งโลก) เก็บไพ่ที่ทำร้ายขึ้นมือ`); }
    }
    if (id === 'xiahoudun' && src && src.alive && src !== tgt) {
      if (await this.yesno(tgt, 'ย้อนรอยศัตรู: จั่วไพ่ตัดสิน?', true)) {
        const j = await this.judge(tgt, 'ย้อนรอยศัตรู', (x) => x.suit !== 'C');
        if (j.suit !== 'C' && src.alive) {
          let ok = false;
          if (src.hand.length >= 2) {
            const a = await this.ask(src, { type: 'cards', prompt: `${tgt.name} ย้อนรอยศัตรู: ทิ้งไพ่ในมือ 2 ใบ (หรือกดข้ามเพื่อเสียพลังชีวิต 1)`, eligible: src.hand.map((c) => c.id), min: 0, max: 2, ctx: { reason: 'fankui', from: tgt.seat } });
            try { const cs = this.handCards(src, a); if (cs.length === 2) { this.dropHand(src, cs); ok = true; this.log(`${src.name} ทิ้งไพ่ 2 ใบ`); } } catch (e) {}
          }
          if (!ok && src.alive) await this.damage(tgt, src, 1, { type: 'skill' });
        }
      }
    }
    if (id === 'simayi' && src && src.alive && src !== tgt && tgt.alive && this.nCards(src) > 0) {
      if (await this.yesno(tgt, `ชำระแค้น: ขโมยไพ่ 1 ใบจาก ${src.name}?`, true)) await this.stealFrom(tgt, src, 'ชำระแค้น');
    }
  }
  async stealFrom(p, t, why) {
    const items = [];
    if (t.hand.length) items.push({ id: 'hand', label: `ไพ่ในมือ (${t.hand.length} ใบ สุ่ม)` });
    for (const sl of ['weapon', 'armor', 'horse']) if (t.equip[sl]) items.push({ id: sl, label: cname(t.equip[sl]), cardKey: t.equip[sl].key, cardId: t.equip[sl].id });
    if (!items.length) return null;
    const a = await this.ask(p, { type: 'pick', kind: 'zone', prompt: `${why}: เลือกไพ่ของ ${t.name}`, items, min: 1, max: 1, ctx: { target: t.seat, steal: true } });
    const pick = Array.isArray(a) && items.find((i) => i.id === a[0]) ? a[0] : items[0].id;
    let c;
    if (pick === 'hand') { c = t.hand[Math.floor(this.rng() * t.hand.length)]; this.removeHand(t, c); }
    else { c = t.equip[pick]; t.equip[pick] = null; this.equipLost(t); }
    p.hand.push(c);
    this.log(`${p.name} ขโมยไพ่ ${pick === 'hand' ? '1 ใบจากมือ' : cname(c)} ของ ${t.name}`);
    return c;
  }
  async dismantleFrom(p, t) {
    const items = [];
    if (t.hand.length) items.push({ id: 'hand', label: `ไพ่ในมือ (${t.hand.length} ใบ สุ่ม)` });
    for (const sl of ['weapon', 'armor', 'horse']) if (t.equip[sl]) items.push({ id: sl, label: cname(t.equip[sl]), cardKey: t.equip[sl].key, cardId: t.equip[sl].id });
    if (!items.length) return;
    const a = await this.ask(p, { type: 'pick', kind: 'zone', prompt: `ไฟบรรลัยกัลป์: เลือกทำลายไพ่ของ ${t.name}`, items, min: 1, max: 1, ctx: { target: t.seat, dismantle: true } });
    const pick = Array.isArray(a) && items.find((i) => i.id === a[0]) ? a[0] : items[0].id;
    if (pick === 'hand') { const c = t.hand[Math.floor(this.rng() * t.hand.length)]; this.removeHand(t, c); this.toDiscard(c); this.log(`${p.name} ทำลายไพ่ในมือ 1 ใบของ ${t.name} (${cname(c)})`); }
    else { const c = t.equip[pick]; this.log(`${p.name} ทำลาย ${cname(c)} ของ ${t.name}`); this.dropEquip(t, pick); }
  }
  async loseHp(p, n) { await this.damage(null, p, n, { type: 'loss' }); }
  heal(p, n) { const h = Math.min(n, p.maxHp - p.hp); if (h > 0) { p.hp += h; this.log(`${p.name} ฟื้นพลังชีวิต ${h} (เหลือ ${p.hp})`); } return h; }

  healKeyOK(p, c) { return c.key === 'heal' || (p.hero.id === 'huatuo' && isRed(c.suit)); }
  async dying(p, src) {
    this.log(`${p.name} พลังชีวิตเหลือ ${p.hp} — กำลังจะตาย!`);
    while (p.hp <= 0) {
      let saved = false;
      for (const q of this.order(this.cur && this.cur.alive ? this.cur : p)) {
        const el = q.hand.filter((c) => this.healKeyOK(q, c));
        if (!el.length) continue;
        const a = await this.ask(q, { type: 'respond', need: 'heal', prompt: q === p ? 'คุณกำลังจะตาย! ใช้ ฟื้นพลัง ช่วยตัวเอง?' : `ช่วย ${p.name} ที่กำลังจะตาย ด้วย ฟื้นพลัง?`, eligible: el.map((c) => c.id), ctx: { dying: p.seat } });
        const ids = a && a.cardIds;
        if (Array.isArray(ids) && ids.length === 1) {
          const c = q.hand.find((x) => x.id === ids[0]);
          if (c && this.healKeyOK(q, c)) {
            this.removeHand(q, c); this.toDiscard(c);
            const amt = (p.hero.id === 'sunquan' && q !== p && q.hero.faction === 'wu') ? 2 : 1;
            p.hp += amt; this.log(`${q.name} ใช้ ฟื้นพลัง ช่วย ${p.name} (+${amt})`);
            if (q !== p) { q.evidence.helped[p.seat] = (q.evidence.helped[p.seat] || 0) + 1; this.helpLog = this.helpLog || {}; this.helpLog[q.seat + '>' + p.seat] = 1; }
            saved = true; break;
          }
        }
      }
      if (!saved) break;
    }
    return p.hp > 0;
  }
  async kill(p, src) {
    if (p.hero.id === 'pangtong') {
      const j = await this.judge(p, 'หงส์เพลิงคืนชีพ', (x) => isRed(x.suit));
      if (isRed(j.suit)) { p.hp = 1; this.log(`${p.name} (หงส์เพลิงคืนชีพ) ฟื้นคืนชีพด้วยพลังชีวิต 1`); return; }
    }
    p.alive = false; p.revealed = true; p.hp = 0;
    this.log(`☠ ${p.name} (${p.hero.name}) ตาย — บทบาท ${D.ROLE_NAMES[p.role]}`);
    for (const c of p.hand) this.toDiscard(c); p.hand = [];
    for (const k of Object.keys(p.equip)) if (p.equip[k]) { this.toDiscard(p.equip[k]); p.equip[k] = null; }
    for (const c of p.delayed) this.toDiscard(c); p.delayed = [];
    this.checkWin();
    if (src && src.alive && src !== p) {
      if (p.role === 'rebel') { this.log(`${src.name} กำจัดกบฎ จั่วไพ่ 3 ใบ`); this.draw(src, 3, true); }
      if (p.role === 'loyal' && src.role === 'lord') {
        this.log(`จักรพรรดิ์ ${src.name} สังหารผู้ภักดี! ต้องทิ้งไพ่ทั้งหมด`);
        for (const c of src.hand) this.toDiscard(c); src.hand = [];
        for (const k of Object.keys(src.equip)) if (src.equip[k]) { this.toDiscard(src.equip[k]); src.equip[k] = null; }
      }
    }
  }

  // ---------- ตอบสนองด้วยไพ่ ----------
  asKeys(p, c) {
    const ks = [c.key], id = p.hero.id;
    if (id === 'guanyu' && isRed(c.suit)) ks.push('attack');
    if (id === 'zhaoyun') { if (c.key === 'defend') ks.push('attack'); if (c.key === 'attack') ks.push('defend'); }
    if (id === 'zhenji' && isBlack(c.suit)) ks.push('defend');
    if (id === 'huatuo' && isRed(c.suit)) ks.push('heal');
    return ks;
  }
  eligible(p, need) { return p.hand.filter((c) => this.asKeys(p, c).includes(need)); }
  helperFaction(p, need) {
    if (need === 'attack' && p.hero.id === 'liubei' && p.role === 'lord') return 'shu';
    if (need === 'defend' && p.hero.id === 'caocao' && p.role === 'lord') return 'wei';
    return null;
  }
  // คืนค่า {cards,suit,via} หรือ null
  async askNeed(p, need, ctx = {}) {
    let armorTried = false, helpTried = false;
    for (let guard = 0; guard < 8; guard++) {
      const el = this.eligible(p, need).map((c) => c.id);
      const multi = need === 'attack' && p.equip.weapon && p.equip.weapon.key === 'serpent' && p.hand.length >= 2;
      const canArmor = need === 'defend' && !armorTried && !ctx.ignoreArmor && p.equip.armor && p.equip.armor.key === 'eight';
      const fac = this.helperFaction(p, need);
      const canHelp = !!fac && !helpTried && this.players.some((q) => q.alive && q !== p && q.hero.faction === fac);
      if (!el.length && !multi && !canArmor && !canHelp) return null;
      const a = await this.ask(p, { type: 'respond', need, prompt: ctx.prompt || (need === 'attack' ? 'ใช้ "โจมตี" ?' : 'ใช้ "ป้องกัน" ?'), eligible: el, multi, canArmor, canHelp, helpLabel: fac === 'shu' ? 'ขอ โจมตี จากขุนศึกจ๊ก' : 'ขอ ป้องกัน จากขุนศึกวุย', ctx: { src: ctx.src ? ctx.src.seat : null, ...(ctx.info || {}) } });
      if (!a) return null;
      if (a.armor && canArmor) {
        armorTried = true;
        const j = await this.judge(p, 'เกราะหลีกเทพบุตรพล', (x) => isRed(x.suit));
        if (isRed(j.suit)) { this.log(`${p.name} ใช้เกราะ ป้องกันสำเร็จ`); return { via: 'armor', cards: [] }; }
        this.log(`${p.name} ใช้เกราะ แต่ไม่สำเร็จ`); continue;
      }
      if (a.help && canHelp) {
        helpTried = true;
        for (const h of this.order(p).filter((q) => q !== p && q.hero.faction === fac)) {
          const hel = this.eligible(h, need);
          if (!hel.length) continue;
          const r = await this.ask(h, { type: 'respond', need, prompt: `ช่วย ${p.name}: ใช้ "${CARD_TYPES[need].name}" แทนเขา?`, eligible: hel.map((c) => c.id), ctx: { helping: p.seat } });
          const got = this.takeResponse(h, need, r);
          if (got) { this.log(`${h.name} ช่วย ${p.name} ใช้ ${CARD_TYPES[need].name}`); h.evidence.helped[p.seat] = (h.evidence.helped[p.seat] || 0) + 1; this.helpLog = this.helpLog || {}; this.helpLog[h.seat + '>' + p.seat] = 1; return got; }
        }
        continue;
      }
      const got = this.takeResponse(p, need, a);
      if (got) return got;
      return null;
    }
    return null;
  }
  takeResponse(p, need, a) {
    const ids = a && a.cardIds; if (!Array.isArray(ids) || !ids.length) return null;
    let cs; try { cs = this.handCards(p, ids); } catch (e) { return null; }
    if (cs.length === 1) { if (!this.asKeys(p, cs[0]).includes(need)) return null; }
    else if (cs.length === 2) { if (!(need === 'attack' && p.equip.weapon && p.equip.weapon.key === 'serpent')) return null; }
    else return null;
    for (const c of cs) { this.removeHand(p, c); this.toDiscard(c); }
    this.log(`${p.name} ใช้ ${cs.map(cname).join(' + ')} เป็น ${CARD_TYPES[need].name}`);
    return { via: 'card', cards: cs, suit: cs.length === 1 ? cs[0].suit : null };
  }
  async tryNullify(p, trickCard) {
    const el = p.hand.filter((c) => c.key === 'nullify');
    if (!el.length) return false;
    const a = await this.ask(p, { type: 'respond', need: 'nullify', prompt: `${CARD_TYPES[trickCard.key].name} จะมีผลกับคุณ — ใช้ ยกเลิกอุบาย?`, eligible: el.map((c) => c.id), ctx: { trick: trickCard.key } });
    const got = a && Array.isArray(a.cardIds) && a.cardIds.length === 1 ? p.hand.find((c) => c.id === a.cardIds[0] && c.key === 'nullify') : null;
    if (!got) return false;
    this.removeHand(p, got); this.toDiscard(got); return true;
  }
}
module.exports = { Game, Invalid, GameOver, cname, isBlack };
require('./engine_cards.js');
