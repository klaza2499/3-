'use strict';
const D = require('../shared/data.js');
const { CARD_TYPES, isRed } = D;
const { Game, Invalid, cname, isBlack } = require('./engine.js');
const P = Game.prototype;

P.kongcheng = function (q) { return q.hero.id === 'zhugeliang' && q.alive && q.hand.length === 0; };
P.unlimitedAttack = function (p) { return p.hero.id === 'zhangfei' || (p.equip.weapon && p.equip.weapon.key === 'crossbow'); };
P.cKey = function (c) { return c.asKey || c.key; };

// ---------- การใช้ไพ่ในตา ----------
P.cardUses = function (p, c) {
  const out = [], keys = [c.key], id = p.hero.id;
  if (id === 'guanyu' && isRed(c.suit)) keys.push('attack');
  if (id === 'zhaoyun' && c.key === 'defend') keys.push('attack');
  if (id === 'ganning' && isBlack(c.suit)) keys.push('dismantle');
  if (id === 'daqiao' && c.suit === 'S') keys.push('indulgence');
  if (id === 'huatuo' && isRed(c.suit)) keys.push('heal');
  const others = this.others(p);
  const tr = this.trickRange(p);
  for (const k of keys) {
    const def = CARD_TYPES[k];
    const o = { as: k, label: k === c.key ? def.name : `ใช้เป็น ${def.name}` };
    switch (k) {
      case 'attack': {
        if (this.ts.attacks >= 1 && !this.unlimitedAttack(p)) break;
        const t = others.filter((q) => this.inAtkRange(p, q) && !this.kongcheng(q)).map((q) => q.seat);
        if (!t.length) break;
        const multi = p.equip.weapon && p.equip.weapon.key === 'skyhalberd' && p.hand.length === 1;
        out.push({ ...o, kind: 'targets', targets: t, min: 1, max: multi ? 3 : 1 }); break;
      }
      case 'heal': { const t = this.alive().filter((q) => q.hp < q.maxHp).map((q) => q.seat); if (t.length) out.push({ ...o, kind: 'targets', targets: t, min: 1, max: 1 }); break; }
      case 'dismantle': {
        const r = tr + (id === 'ganning' ? 5 : 0);
        const t = others.filter((q) => this.dist(p, q) <= r && this.nCards(q) > 0).map((q) => q.seat);
        if (t.length) out.push({ ...o, kind: 'targets', targets: t, min: 1, max: 1 }); break;
      }
      case 'steal': {
        const t = others.filter((q) => this.dist(p, q) <= tr && this.nCards(q) > 0 && q.hero.id !== 'lusu').map((q) => q.seat);
        if (t.length) out.push({ ...o, kind: 'targets', targets: t, min: 1, max: 1 }); break;
      }
      case 'duel': { const t = others.filter((q) => !this.kongcheng(q)).map((q) => q.seat); if (t.length) out.push({ ...o, kind: 'targets', targets: t, min: 1, max: 1 }); break; }
      case 'borrow': {
        const victims = {};
        for (const q of others) if (q.equip.weapon) { const v = this.alive().filter((x) => x !== q && this.inAtkRange(q, x)).map((x) => x.seat); if (v.length) victims[q.seat] = v; }
        const t = Object.keys(victims).map(Number);
        if (t.length) out.push({ ...o, kind: 'pair', targets: t, victims, min: 2, max: 2 }); break;
      }
      case 'indulgence': {
        const r = tr + (id === 'daqiao' ? 5 : 0);
        const t = others.filter((q) => this.dist(p, q) <= r && q.hero.id !== 'lusu' && !q.delayed.some((d) => this.cKey(d) === 'indulgence')).map((q) => q.seat);
        if (t.length) out.push({ ...o, kind: 'targets', targets: t, min: 1, max: 1 }); break;
      }
      case 'fireboat': if (!p.delayed.some((d) => this.cKey(d) === 'fireboat')) out.push({ ...o, kind: 'none' }); break;
      case 'harvest': case 'barbarians': case 'arrows': case 'peachGarden': case 'draw2': out.push({ ...o, kind: 'none' }); break;
      default: if (['weapon', 'armor', 'horse'].includes(def.kind)) out.push({ ...o, kind: 'none', label: 'ติดตั้ง' });
    }
  }
  return out;
};

P.playPhase = async function (p) {
  let bad = 0;
  while (p.alive) {
    const uses = {};
    for (const c of p.hand) { const u = this.cardUses(p, c); if (u.length) uses[c.id] = u; }
    const ans = await this.ask(p, { type: 'play', uses, skills: this.skillList(p) });
    if (!ans || ans.act === 'end') break;
    try {
      if (ans.act === 'card') await this.useCard(p, ans);
      else if (ans.act === 'skill') await this.useSkill(p, ans);
      else throw new Invalid('คำสั่งไม่ถูกต้อง');
      bad = 0;
    } catch (e) {
      if (e instanceof Invalid) { bad++; this.log(`(ทำไม่ได้: ${e.message || 'ไม่ถูกต้อง'})`, [p.seat]); if (bad >= 6) break; }
      else throw e;
    }
  }
};

P.useCard = async function (p, ans) {
  const c = p.hand.find((x) => x.id === ans.cardId);
  if (!c) throw new Invalid('ไม่มีไพ่ใบนี้');
  const as = ans.as || c.key;
  const u = this.cardUses(p, c).find((x) => x.as === as);
  if (!u) throw new Invalid('ใช้ไพ่ใบนี้ตอนนี้ไม่ได้');
  let tg = [];
  if (u.kind === 'targets' || u.kind === 'pair') {
    const seats = Array.isArray(ans.targets) ? ans.targets : [];
    if (new Set(seats).size !== seats.length) throw new Invalid('เป้าหมายซ้ำ');
    if (u.kind === 'targets') {
      if (seats.length < u.min || seats.length > u.max || seats.some((s) => !u.targets.includes(s))) throw new Invalid('เป้าหมายไม่ถูกต้อง');
    } else {
      if (seats.length !== 2 || !u.targets.includes(seats[0]) || !(u.victims[seats[0]] || []).includes(seats[1])) throw new Invalid('เป้าหมายไม่ถูกต้อง');
    }
    tg = seats.map((s) => this.players[s]);
  }
  const def = CARD_TYPES[as];
  this.removeHand(p, c);
  if (['weapon', 'armor', 'horse'].includes(def.kind)) {
    const old = p.equip[def.kind]; p.equip[def.kind] = c;
    this.log(`${p.name} ติดตั้ง ${cname(c)}`);
    if (old) { this.toDiscard(old); this.equipLost(p); }
    return;
  }
  this.log(`${p.name} ใช้ ${cname(c)}${as !== c.key ? ` เป็น ${def.name}` : ''}${tg.length ? ' ใส่ ' + tg.map((q) => q.name).join(', ') : ''}`);
  if (def.kind === 'trick' || def.kind === 'delayed') { if (p.hero.id === 'huangyueying') { this.log(`${p.name} (อ่อนสยบแข็ง) จั่ว 1 ใบ`); this.draw(p, 1, true); } }
  const info = { suit: c.suit, cards: [c], key: as };
  if (def.kind === 'delayed') {
    c.asKey = as; const t = as === 'fireboat' ? p : tg[0]; t.delayed.push(c); return;
  }
  this.toDiscard(c);
  await this.resolveCard(p, as, tg, info);
};

P.resolveCard = async function (p, as, tg, info) {
  switch (as) {
    case 'attack': {
      this.ts.attacks++; this.ts.attacked = true;
      for (const t of tg) await this.doAttack(p, t, info);
      break;
    }
    case 'heal': { const t = tg[0]; if (t.hp < t.maxHp) this.heal(t, 1); break; }
    case 'draw2': this.draw(p, 2); break;
    case 'dismantle': { const t = tg[0]; if (await this.tryNullify(t, { key: 'dismantle' })) { this.log(`${t.name} ยกเลิกอุบาย`); break; } await this.dismantleFrom(p, t); break; }
    case 'steal': { const t = tg[0]; if (await this.tryNullify(t, { key: 'steal' })) { this.log(`${t.name} ยกเลิกอุบาย`); break; } await this.stealFrom(p, t, 'ปล้นเสบียง'); break; }
    case 'duel': { const t = tg[0]; if (await this.tryNullify(t, { key: 'duel' })) { this.log(`${t.name} ยกเลิกอุบาย`); break; } await this.doDuel(p, t); break; }
    case 'barbarians': case 'arrows': {
      const need = as === 'barbarians' ? 'attack' : 'defend';
      for (const q of this.order(p).filter((x) => x !== p)) {
        if (!q.alive) continue;
        if (await this.tryNullify(q, { key: as })) { this.log(`${q.name} ยกเลิกอุบาย`); continue; }
        const r = await this.askNeed(q, need, { prompt: `${CARD_TYPES[as].name}: ใช้ "${CARD_TYPES[need].name}" ?`, src: p });
        if (!r) await this.damage(p, q, 1, { type: 'trick' });
      }
      break;
    }
    case 'peachGarden': for (const q of this.order(p)) if (q.hp < q.maxHp) this.heal(q, 1); break;
    case 'harvest': {
      const ord = this.order(p); const pool = [];
      for (let i = 0; i < ord.length; i++) { const c = this.drawOne(); if (c) pool.push(c); }
      this.log(`เปิดไพ่ ${pool.length} ใบ: ${pool.map(cname).join(', ')}`);
      for (const q of ord) {
        if (!pool.length) break;
        const a = await this.ask(q, { type: 'pick', kind: 'cardpool', prompt: 'เก็บเกี่ยวยุ้งฉาง: เลือกหยิบไพ่ 1 ใบ', items: pool.map((c) => ({ id: c.id, cardId: c.id, cardKey: c.key, label: cname(c) })), min: 1, max: 1 });
        let c = Array.isArray(a) && pool.find((x) => x.id === a[0]); if (!c) c = pool[0];
        pool.splice(pool.indexOf(c), 1); q.hand.push(c); this.log(`${q.name} หยิบ ${cname(c)}`);
      }
      pool.forEach((c) => this.toDiscard(c));
      break;
    }
    case 'borrow': {
      const [t, v] = tg;
      if (await this.tryNullify(t, { key: 'borrow' })) { this.log(`${t.name} ยกเลิกอุบาย`); break; }
      if (!t.equip.weapon || !v.alive) break;
      const r = await this.askNeed(t, 'attack', { prompt: `ยืมมือสังหาร: ใช้ "โจมตี" ใส่ ${v.name} (ไม่ทำ = ต้องมอบอาวุธให้ ${p.name})`, src: p, info: { victim: v.seat } });
      if (r && v.alive) { this.ts.noCount = true; await this.doAttack(t, v, { suit: r.suit, cards: r.cards, key: 'attack' }); }
      else if (t.equip.weapon) { const w = t.equip.weapon; t.equip.weapon = null; p.hand.push(w); this.log(`${t.name} ต้องมอบ ${cname(w)} ให้ ${p.name}`); this.equipLost(t); }
      break;
    }
  }
};

P.doDuel = async function (src, tgt) {
  const sides = [tgt, src]; let i = 0;
  this.log(`${src.name} ท้าสู้กับ ${tgt.name}`);
  for (let guard = 0; guard < 200; guard++) {
    const cur = sides[i], opp = sides[1 - i];
    const need = opp.hero.id === 'lvbu' ? 2 : 1;
    let ok = true;
    for (let k = 0; k < need; k++) {
      const r = await this.askNeed(cur, 'attack', { prompt: `ท้าสู้กับ ${opp.name}: ใช้ "โจมตี" ?${need > 1 ? ` (ต้องใช้ ${need} ใบ — ใบที่ ${k + 1})` : ''}`, src: opp });
      if (!r) { ok = false; break; }
    }
    if (!ok) {
      const dmg = (opp.hero.id === 'huaxiong' && this.cur === opp && this.ts.sniper) ? 2 : 1;
      await this.damage(opp, cur, dmg, { type: 'duel' }); return;
    }
    if (!src.alive || !tgt.alive) return;
    i = 1 - i;
  }
};

P.doAttack = async function (att, tgt, info, opts = {}) {
  if (!att.alive || !tgt.alive) return;
  if (!opts.redirected && tgt.hero.id === 'daqiao' && tgt.hand.length > 0) {
    const cands = this.alive().filter((q) => q !== tgt && q !== att && this.inAtkRange(att, q) && !this.kongcheng(q));
    if (cands.length) {
      const a = await this.ask(tgt, { type: 'cards', prompt: `ดอกเหมยเปลี่ยนสี: ${att.name} โจมตีคุณ — ทิ้งไพ่ 1 ใบเพื่อเปลี่ยนเป้าหมาย? (ข้ามถ้าไม่ใช้)`, eligible: tgt.hand.map((c) => c.id), min: 0, max: 1, ctx: { reason: 'liuli', from: att.seat } });
      if (Array.isArray(a) && a.length === 1) {
        const c = tgt.hand.find((x) => x.id === a[0]);
        if (c) {
          const t2 = await this.ask(tgt, { type: 'pick', kind: 'seat', prompt: 'เปลี่ยนเป้าหมายไปที่ใคร?', items: cands.map((q) => ({ id: q.seat, label: q.name })), min: 1, max: 1, ctx: { liuli: true } });
          const nt = this.players[Array.isArray(t2) ? t2[0] : cands[0].seat];
          if (cands.includes(nt)) {
            this.removeHand(tgt, c); this.toDiscard(c);
            this.log(`${tgt.name} (ดอกเหมยเปลี่ยนสี) เปลี่ยนเป้าหมายไปที่ ${nt.name}`);
            return this.doAttack(att, nt, info, { ...opts, redirected: true });
          }
        }
      }
    }
  }
  const wp = att.equip.weapon ? att.equip.weapon.key : null;
  if (wp === 'twin' && att.hero.gender !== tgt.hero.gender) {
    const items = [{ id: 'draw', label: 'จั่วไพ่ 1 ใบ' }];
    if (tgt.hand.length) items.push({ id: 'break', label: `ทำลายไพ่ในมือ ${tgt.name} 1 ใบ` });
    const a = await this.ask(att, { type: 'pick', kind: 'choice', prompt: 'กระบี่อัสนี: เลือกผลพิเศษ', items, min: 1, max: 1 });
    const pick = Array.isArray(a) && items.find((i) => i.id === a[0]) ? a[0] : 'draw';
    if (pick === 'draw') { this.draw(att, 1); } else { const c = tgt.hand[Math.floor(this.rng() * tgt.hand.length)]; this.removeHand(tgt, c); this.toDiscard(c); this.log(`${att.name} ทำลายไพ่ในมือ ${tgt.name}`); }
  }
  let unblock = false;
  if (att.hero.id === 'machao') { const j = await this.judge(att, 'ร้อยหมื่นอาชา', (x) => isRed(x.suit)); if (isRed(j.suit)) { unblock = true; this.log(`${tgt.name} ป้องกันไม่ได้ (ร้อยหมื่นอาชา)`); } }
  const ignoreArmor = wp === 'jade';
  if (!ignoreArmor && tgt.equip.armor && tgt.equip.armor.key === 'shield' && info.suit && isBlack(info.suit)) { this.log(`โล่ทองราชันย์ของ ${tgt.name} ป้องกันการโจมตีสีดำ`); return; }
  let defended = false;
  if (!unblock) {
    const need = att.hero.id === 'lvbu' ? 2 : 1; let got = 0;
    for (let i = 0; i < need; i++) {
      const r = await this.askNeed(tgt, 'defend', { prompt: `${att.name} โจมตีคุณ — ใช้ "ป้องกัน" ?${need > 1 ? ` (ต้องใช้ ${need} ใบ — ใบที่ ${i + 1})` : ''}`, src: att, ignoreArmor, info: { atkSuit: info.suit || null } });
      if (!r) break; got++;
    }
    defended = got >= need;
  }
  if (defended) {
    this.log(`${tgt.name} ป้องกันสำเร็จ`);
    if (wp === 'axe' && att.alive && att.hand.length >= 2) {
      const a = await this.ask(att, { type: 'cards', prompt: `ขวานผ่าพสุธา: ทิ้งไพ่ในมือ 2 ใบ เพื่อให้การโจมตี ${tgt.name} สำเร็จ? (ข้ามถ้าไม่ใช้)`, eligible: att.hand.map((c) => c.id), min: 0, max: 2, ctx: { reason: 'axe', target: tgt.seat } });
      try { const cs = this.handCards(att, a); if (cs.length === 2) { this.dropHand(att, cs); defended = false; this.log(`${att.name} ใช้ขวานผ่าพสุธา โจมตีสำเร็จ!`); } } catch (e) {}
    } else if (wp === 'dragon' && att.alive && tgt.alive) {
      const r = await this.askNeed(att, 'attack', { prompt: `ง้าวมังกรเขียว: ใช้ "โจมตี" ${tgt.name} ซ้ำ?`, src: tgt, info: { dragon: tgt.seat } });
      if (r) { this.log(`${att.name} โจมตีซ้ำด้วยง้าวมังกรเขียว`); return this.doAttack(att, tgt, { suit: r.suit, cards: r.cards, key: 'attack' }, { redirected: true }); }
    }
  }
  if (defended) return;
  const dmg = (att.hero.id === 'huaxiong' && this.cur === att && this.ts.sniper) ? 2 : 1;
  await this.damage(att, tgt, dmg, { type: 'attack', cause: info.cards });
  if (!tgt.alive) return;
  if (wp === 'bow' && tgt.equip.horse) { this.log(`ธนูกินลาเพลิง: ${tgt.name} ต้องถอดม้า`); this.dropEquip(tgt, 'horse'); }
  if (wp === 'fireblade' && att.alive && tgt.alive) {
    const items = [{ id: 'hp', label: 'เสียพลังชีวิต 1 หน่วย' }];
    if (tgt.hand.length >= 2) items.push({ id: 'cards', label: 'ทิ้งไพ่ในมือ 2 ใบ' });
    const a = await this.ask(tgt, { type: 'pick', kind: 'choice', prompt: `ดาบอัคคีของ ${att.name}: เลือกผลที่คุณยอมรับ`, items, min: 1, max: 1 });
    const pick = Array.isArray(a) && items.find((i) => i.id === a[0]) ? a[0] : 'hp';
    if (pick === 'cards') {
      const b = await this.ask(tgt, { type: 'cards', prompt: 'ทิ้งไพ่ในมือ 2 ใบ', eligible: tgt.hand.map((c) => c.id), min: 2, max: 2, ctx: { reason: 'forced' } });
      let cs; try { cs = this.handCards(tgt, b); if (cs.length !== 2) throw new Invalid(); } catch (e) { cs = tgt.hand.slice(0, 2); }
      this.dropHand(tgt, cs); this.log(`${tgt.name} ทิ้งไพ่ 2 ใบ`);
    } else await this.damage(att, tgt, 1, { type: 'skill' });
  }
};

// ---------- ทักษะที่กดใช้เอง ----------
P.skillList = function (p) {
  const out = [], id = p.hero.id, used = this.ts.skills, h = p.hand.map((c) => c.id), others = this.others(p);
  const S = (sid, label, desc, sel) => out.push({ id: sid, label, desc, sel });
  const wounded = this.alive().filter((q) => q.hp < q.maxHp);
  if (id === 'liubei' && h.length && others.length) S('rende', 'ถือคุณธรรม', 'ให้ไพ่ในมือแก่ผู้เล่นอื่น', { cards: { min: 1, max: h.length, list: h }, targets: { min: 1, max: 1, list: others.map((q) => q.seat) } });
  if (id === 'sunquan' && !used.zhiheng && h.length) S('zhiheng', 'พรจากสวรรค์', 'ทิ้งไพ่แล้วจั่วเท่ากัน (1 ครั้ง/รอบ)', { cards: { min: 1, max: h.length, list: h } });
  if (id === 'huanggai') S('kurou', 'สละชีพ', 'เสียพลังชีวิต 1 เพื่อจั่วไพ่ 2 ใบ', {});
  if (id === 'diaochan' && !used.lijian && h.length) {
    const m = others.filter((q) => this.isMale(q)).map((q) => q.seat);
    if (m.length >= 2) S('lijian', 'ยุให้แยก', 'ทิ้งไพ่ 1 ใบ ให้ชาย 2 คนท้าสู้กัน (คนแรกที่เลือกต้องตอบก่อน)', { cards: { min: 1, max: 1, list: h }, targets: { min: 2, max: 2, list: m } });
  }
  if (id === 'sunshangxiang' && !used.jieyin && h.length >= 2) {
    const m = others.filter((q) => this.isMale(q) && q.hp < q.maxHp).map((q) => q.seat);
    if (m.length) S('jieyin', 'แผนแต่งงาน', 'ทิ้งไพ่ 2 ใบ ฟื้นพลังคุณและชายที่เลือกคนละ 1', { cards: { min: 2, max: 2, list: h }, targets: { min: 1, max: 1, list: m } });
  }
  if (id === 'huatuo' && !used.sacrifice && h.length && wounded.length) S('sacrifice', 'เสียสละตน', 'ทิ้งไพ่ 1 ใบ ฟื้นพลังให้ใครก็ได้ 1', { cards: { min: 1, max: 1, list: h }, targets: { min: 1, max: 1, list: wounded.map((q) => q.seat) } });
  if (id === 'zhouyu' && !used.loan && h.length) { const t = others.map((q) => q.seat); if (t.length) S('loan', 'ล่อลวง', 'ให้ผู้เล่นทายสัญลักษณ์ไพ่ในมือคุณ', { targets: { min: 1, max: 1, list: t } }); }
  if (id === 'pangtong') {
    const red = p.hand.filter((c) => isRed(c.suit)).map((c) => c.id), t = others.filter((q) => q.hand.length).map((q) => q.seat);
    if (red.length && t.length) S('peek', 'กลลูกโซ่', 'ทิ้งไพ่ ● / ■ เพื่อแอบดูไพ่ในมือ (สูงสุด 2 คน)', { cards: { min: 1, max: 1, list: red }, targets: { min: 1, max: 2, list: t } });
  }
  return out;
};

P.useSkill = async function (p, ans) {
  const sk = this.skillList(p).find((s) => s.id === ans.id);
  if (!sk) throw new Invalid('ใช้ทักษะนี้ไม่ได้');
  const sel = sk.sel;
  const cs = sel.cards ? this.handCards(p, ans.cardIds || []) : [];
  if (sel.cards && (cs.length < sel.cards.min || cs.length > sel.cards.max || cs.some((c) => !sel.cards.list.includes(c.id)))) throw new Invalid('เลือกไพ่ไม่ถูกต้อง');
  const seats = Array.isArray(ans.targets) ? ans.targets : [];
  if (sel.targets) { if (seats.length < sel.targets.min || seats.length > sel.targets.max || new Set(seats).size !== seats.length || seats.some((s) => !sel.targets.list.includes(s))) throw new Invalid('เลือกเป้าหมายไม่ถูกต้อง'); }
  const tg = seats.map((s) => this.players[s]);
  const used = this.ts.skills;
  switch (sk.id) {
    case 'rende': {
      const t = tg[0]; for (const c of cs) { this.removeHand(p, c); t.hand.push(c); }
      this.log(`${p.name} (ถือคุณธรรม) มอบไพ่ ${cs.length} ใบให้ ${t.name}`);
      this.ts.rendeGiven += cs.length;
      if (this.ts.rendeGiven >= 2 && !this.ts.rendeHealed) { this.ts.rendeHealed = true; if (p.hp < p.maxHp) this.heal(p, 1); }
      break;
    }
    case 'zhiheng': used.zhiheng = true; this.dropHand(p, cs); this.log(`${p.name} (พรจากสวรรค์) ทิ้ง ${cs.length} ใบ จั่วใหม่`); this.draw(p, cs.length, true); break;
    case 'kurou': this.log(`${p.name} (สละชีพ)`); await this.loseHp(p, 1); if (p.alive) this.draw(p, 2); break;
    case 'lijian': used.lijian = true; this.dropHand(p, cs); this.log(`${p.name} (ยุให้แยก) ให้ ${tg[0].name} กับ ${tg[1].name} ท้าสู้กัน`); await this.doDuel(tg[1], tg[0]); break;
    case 'jieyin': used.jieyin = true; this.dropHand(p, cs); this.log(`${p.name} (แผนแต่งงาน)`); this.heal(p, 1); this.heal(tg[0], 1); break;
    case 'sacrifice': used.sacrifice = true; this.dropHand(p, cs); this.log(`${p.name} (เสียสละตน)`); this.heal(tg[0], 1); break;
    case 'loan': {
      used.loan = true; const t = tg[0];
      this.log(`${p.name} (ล่อลวง) ให้ ${t.name} ทายไพ่ในมือ`);
      const a = await this.ask(t, { type: 'pick', kind: 'hidden', prompt: `ล่อลวงของ ${p.name}: เลือกไพ่ใบที่คุณจะหยิบ (ไม่เห็นหน้าไพ่)`, items: p.hand.map((c, i) => ({ id: i, label: `ไพ่ใบที่ ${i + 1}` })), min: 1, max: 1 });
      const idx = Array.isArray(a) && a[0] >= 0 && a[0] < p.hand.length ? a[0] : 0;
      const g = await this.ask(t, { type: 'pick', kind: 'suit', prompt: 'ทายสัญลักษณ์ของไพ่ใบนั้น', items: ['C', 'S', 'T', 'X'].map((s) => ({ id: s, label: D.SUITS[s], suit: s })), min: 1, max: 1 });
      const guess = Array.isArray(g) ? g[0] : 'C';
      const c = p.hand[idx];
      if (c && c.suit === guess) { this.removeHand(p, c); t.hand.push(c); this.log(`${t.name} ทายถูก! ได้ไพ่ไป`); }
      else { this.log(`${t.name} ทายผิด!`); await this.damage(p, t, 1, { type: 'skill' }); }
      break;
    }
    case 'peek': {
      this.dropHand(p, cs); this.log(`${p.name} (กลลูกโซ่) แอบดูไพ่ของ ${tg.map((q) => q.name).join(', ')}`);
      for (const q of tg) if (this.io.reveal) this.io.reveal(p.seat, `ไพ่ในมือของ ${q.name}`, q.hand.map((c) => c.id));
      break;
    }
  }
};
