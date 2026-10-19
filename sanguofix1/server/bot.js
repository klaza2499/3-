'use strict';
// บอต AI แบบง่าย: เดาบทบาทจากพฤติกรรม แล้วตัดสินใจตามกติกา
const D = require('../shared/data.js');
const { CARD_TYPES, isRed } = D;

const VAL = { heal: 9, peachGarden: 8, nullify: 7, defend: 7, draw2: 6, dismantle: 6, steal: 6, indulgence: 6, duel: 5, attack: 5, barbarians: 4, arrows: 4, harvest: 3, borrow: 3, fireboat: 2, eight: 5, shield: 5, horse: 4, chitu: 5 };
const value = (c) => VAL[c.key] ?? 4;

function atk(g, a, b) { return (g.attackLog && g.attackLog[a + '>' + b]) || 0; }
function lordOf(g) { return g.players.find((p) => p.role === 'lord'); }

// ความอยากทำร้าย q ในมุมมองของ p (บวก = ศัตรู ลบ = มิตร)
function want(g, p, q) {
  if (p === q) return -99;
  const lord = lordOf(g); const aggr = Math.min(3, g.round / 15);
  let w = 0;
  const hit = atk(g, q.seat, lord.seat), hitMe = atk(g, q.seat, p.seat);
  const helped = g.helpLog && g.helpLog[q.seat + '>' + lord.seat] ? 1 : 0;
  if (p.role === 'lord') { w = 3 * Math.min(2, hit) + 1.5 * hitMe; if (q.revealed && (q.role === 'rebel' || q.role === 'traitor')) w = 9; }
  else if (p.role === 'loyal') { if (q === lord) w = -99; else w = 3 * Math.min(2, hit) + 1.2 * hitMe - 1.5 * helped; }
  else if (p.role === 'rebel') { if (q === lord) w = 8; else w = 0.8 - 2.5 * Math.min(2, hit) + 2 * helped + 0.8 * hitMe; }
  else { // traitor
    if (q === lord) w = g.alive().length <= 2 ? 6 : -1.5;
    else w = 0.6 + (4 - Math.min(4, q.hp)) * 0.35 + (hit ? 0.8 : 0) + 0.5 * hitMe;
  }
  if (w > -50) w += aggr * (q === lord && p.role === 'loyal' ? 0 : 0.5);
  return w;
}
const ally = (g, p, q) => p === q || want(g, p, q) <= 0.2;

function lowest(g, p, ids, n) {
  const cs = ids.map((i) => g.getCard(i)).sort((a, b) => value(a) - value(b));
  return cs.slice(0, n).map((c) => c.id);
}

function decide(g, seat, req) {
  const p = g.players[seat];
  const rnd = () => g.rng();
  switch (req.type) {
    case 'yesno': return req.botDefault;
    case 'arrange': return { top: req.cards.slice(), bottom: [] };
    case 'pick': return pick(g, p, req);
    case 'cards': return cards(g, p, req);
    case 'respond': return respond(g, p, req);
    case 'play': return play(g, p, req);
  }
  return null;
}

function pick(g, p, req) {
  const items = req.items; const ids = items.map((i) => i.id);
  const ctx = req.ctx || {};
  switch (req.kind) {
    case 'role': return ['ok'];
    case 'hero': { const it = items[Math.floor(g.rng() * items.length)]; return [it.id]; }
    case 'seat': {
      if (ctx.liuli) { const best = items.slice().sort((a, b) => want(g, p, g.players[b.id]) - want(g, p, g.players[a.id]))[0]; return [best.id]; }
      if (ctx.give) { const al = items.filter((i) => want(g, p, g.players[i.id]) <= -0.5 && g.players[i.id] !== lordOf(g) || (p.role !== 'rebel' && g.players[i.id].role === 'lord' && g.players[i.id] !== p)); return al.length ? [al[0].id] : []; }
      // เตียวเลี้ยว: ขโมยไพ่จากศัตรู
      const en = items.filter((i) => want(g, p, g.players[i.id]) >= 0.5).sort((a, b) => g.players[b.id].hand.length - g.players[a.id].hand.length);
      return en.slice(0, req.max).map((i) => i.id);
    }
    case 'zone': {
      const t = g.players[ctx.target]; const bad = ctx.steal ? false : false;
      const e = items.filter((i) => i.cardId);
      const ordr = ['weapon', 'armor', 'horse'];
      const eq = e.sort((a, b) => ordr.indexOf(a.id) - ordr.indexOf(b.id));
      if (eq.length && (want(g, p, t) >= 0 ) && (!items.find((i) => i.id === 'hand') || g.rng() < 0.45)) return [eq[0].id];
      return [items.find((i) => i.id === 'hand') ? 'hand' : items[0].id];
    }
    case 'cardpool': { const best = items.map((i) => ({ i, c: g.getCard(i.cardId) })).sort((a, b) => value(b.c) - value(a.c))[0]; return [best.i.id]; }
    case 'choice': {
      if (ids.includes('hp') && ids.includes('cards')) return [p.hp >= 3 ? 'hp' : 'cards'];
      if (ids.includes('break')) return ['break'];
      return [ids[0]];
    }
    case 'hidden': return [Math.floor(g.rng() * items.length)];
    case 'suit': return [ids[Math.floor(g.rng() * ids.length)]];
  }
  return [ids[0]];
}

function cards(g, p, req) {
  const ctx = req.ctx || {}; const el = req.eligible;
  if (ctx.judgeFn) {
    const o = ctx.judgeOwner, good = ctx.judgeFn, cur = g.getCard(ctx.judge.card);
    const friend = o === p || ally(g, p, o);
    const hand = el.map((i) => g.getCard(i));
    const goodNow = good(cur);
    if (friend && !goodNow) { const c = hand.find((x) => good(x)); return c ? [c.id] : []; }
    if (!friend && goodNow) { const c = hand.find((x) => !good(x)); return c ? [c.id] : []; }
    return [];
  }
  if (ctx.reason === 'liuli') return g.eligible(p, 'defend').length ? [] : lowest(g, p, el, 1);
  if (ctx.reason === 'fankui') return p.hand.length >= 4 ? lowest(g, p, el, 2) : [];
  if (ctx.reason === 'axe') return p.hand.length >= 3 ? lowest(g, p, el, 2) : [];
  if (ctx.give) { const t = g.players[ctx.to]; return t && t !== p ? el.slice(0, 2) : []; }
  return lowest(g, p, el, req.min);
}

function respond(g, p, req) {
  const ctx = req.ctx || {}; const need = req.need;
  const eligibleCards = req.eligible.map((i) => g.getCard(i));
  const pickCard = () => {
    const nat = eligibleCards.filter((c) => c.key === need);
    const pool = nat.length ? nat : eligibleCards;
    pool.sort((a, b) => value(a) - value(b));
    return pool[0];
  };
  if (need === 'heal') {
    const t = g.players[ctx.dying];
    if (t === p || ally(g, p, t) && !(p.role === 'rebel' && t.role === 'lord')) { if (p.role === 'rebel' && t.role === 'lord') return null; return { cardIds: [pickCard().id] }; }
    return null;
  }
  if (need === 'nullify') {
    const k = ctx.trick;
    if (['barbarians', 'arrows'].includes(k)) { if (g.eligible(p, k === 'arrows' ? 'defend' : 'attack').length) return null; }
    return { cardIds: [eligibleCards[0].id] };
  }
  if (ctx.helping !== undefined) { // ช่วยจักรพรรดิ์
    const l = g.players[ctx.helping];
    return ally(g, p, l) && !(p.role === 'rebel') ? { cardIds: [pickCard().id] } : null;
  }
  if (ctx.dragon !== undefined) { const t = g.players[ctx.dragon]; if (want(g, p, t) >= 1 && eligibleCards.length) return { cardIds: [pickCard().id] }; return null; }
  if (need === 'defend' && req.canArmor) return { armor: true };
  if (eligibleCards.length) return { cardIds: [pickCard().id] };
  if (req.canHelp) return { help: true };
  return null;
}

function play(g, p, req) {
  const uses = req.uses; const hand = p.hand;
  const byKey = (k) => hand.filter((c) => (uses[c.id] || []).some((u) => u.as === k));
  const use = (c, k) => (uses[c.id] || []).find((u) => u.as === k);
  const act = (c, u, targets) => ({ act: 'card', cardId: c.id, as: u.as, targets: targets || [] });
  const others = g.others(p);
  const aggr = Math.min(3, g.round / 15);
  const w = (q) => want(g, p, q);
  const key = (k) => byKey(k)[0];
  // 1. ฟื้นพลัง
  for (const c of byKey('heal')) {
    const u = use(c, 'heal');
    const t = u.targets.map((s) => g.players[s]).filter((q) => q === p || (ally(g, p, q) && !(p.role === 'rebel' && q.role === 'lord')));
    t.sort((a, b) => (a.hp / a.maxHp) - (b.hp / b.maxHp));
    if (t.length && (t[0] !== p || p.hp < p.maxHp)) { if (t[0] === p || t[0].hp <= t[0].maxHp - 1) return act(c, u, [t[0].seat]); }
  }
  // 2. ติดตั้งยุทโธปกรณ์
  for (const c of hand) {
    const d = c.def; if (!['weapon', 'armor', 'horse'].includes(d.kind)) continue;
    const cur = p.equip[d.kind];
    const better = !cur || (d.kind === 'weapon' ? d.atk > cur.def.atk : d.kind === 'horse' ? d.atk > cur.def.atk : false);
    if (better && uses[c.id]) return act(c, uses[c.id][0]);
  }
  // 3. อุบายเสริมไพ่
  for (const k of ['draw2', 'harvest']) { const c = key(k); if (c) return act(c, use(c, k)); }
  { const c = key('peachGarden'); if (c) { const wd = g.alive().filter((q) => q.hp < q.maxHp); const good = wd.filter((q) => ally(g, p, q)).length, bad = wd.length - good; if (good >= bad && good > 0) return act(c, use(c, 'peachGarden')); } }
  // 4. อุบายโจมตี
  const enemyTargets = (u, th) => u.targets.map((s) => g.players[s]).filter((q) => w(q) >= th).sort((a, b) => w(b) - w(a));
  { const c = key('indulgence'); if (c) { const u = use(c, 'indulgence'); const t = enemyTargets(u, 1.5)[0]; if (t) return act(c, u, [t.seat]); } }
  for (const k of ['dismantle', 'steal']) { for (const c of byKey(k)) { const u = use(c, k); const t = enemyTargets(u, 0.8 - aggr * 0.2)[0]; if (t) return act(c, u, [t.seat]); } }
  { const c = key('duel'); if (c && g.eligible(p, 'attack').length >= 2) { const u = use(c, 'duel'); const t = enemyTargets(u, 2.5 - aggr * 0.5).sort((a, b) => a.hand.length - b.hand.length)[0]; if (t && t.hand.length <= g.eligible(p, 'attack').length + 1) return act(c, u, [t.seat]); } }
  for (const k of ['barbarians', 'arrows']) {
    const c = key(k); if (!c) continue;
    let s = 0; for (const q of others) s += Math.max(-3, Math.min(3, w(q))); 
    if (s > 0.5 && p.hp >= 2) return act(c, use(c, k));
  }
  { const c = key('borrow'); if (c) { const u = use(c, 'borrow'); for (const t of enemyTargets(u, 0.5)) { const vs = u.victims[t.seat].map((s) => g.players[s]).filter((q) => w(q) >= 1).sort((a, b) => w(b) - w(a)); if (vs.length) return act(c, u, [t.seat, vs[0].seat]); } } }
  { const c = key('fireboat'); if (c && p.hp >= 4 && g.alive().length >= 4 && g.rng() < 0.3) return act(c, use(c, 'fireboat')); }
  // 5. โจมตี
  if (byKey('attack').length) {
    const cands = byKey('attack').sort((a, b) => (a.key === 'attack' ? 0 : 1) - (b.key === 'attack' ? 0 : 1));
    for (const c of cands) {
      const u = use(c, 'attack'); const ts = enemyTargets(u, 1 - aggr * 0.25);
      if (ts.length) {
        const t = ts.sort((a, b) => (w(b) - b.hp * 0.3) - (w(a) - a.hp * 0.3))[0];
        const tgts = [t.seat];
        if (u.max > 1) for (const q of ts.slice(1, u.max)) tgts.push(q.seat);
        return act(c, u, tgts);
      }
    }
  }
  // 6. ทักษะ
  for (const s of req.skills) {
    const sel = s.sel;
    const oth = (list) => list.map((x) => g.players[x]);
    if (s.id === 'rende' && hand.length >= 3 && g.ts.rendeGiven < 2) {
      const t = oth(sel.targets.list).filter((q) => ally(g, p, q)).sort((a, b) => a.hand.length - b.hand.length)[0] || oth(sel.targets.list)[0];
      const cs = hand.slice().sort((a, b) => value(a) - value(b)).slice(0, 2).map((c) => c.id);
      if (t && ally(g, p, t)) return { act: 'skill', id: 'rende', cardIds: cs, targets: [t.seat] };
    }
    if (s.id === 'zhiheng' && hand.length >= 3) { const cs = hand.filter((c) => !['heal', 'defend', 'nullify', 'draw2'].includes(c.key)).sort((a, b) => value(a) - value(b)).slice(0, 2).map((c) => c.id); if (cs.length) return { act: 'skill', id: 'zhiheng', cardIds: cs, targets: [] }; }
    if (s.id === 'kurou' && p.hp >= 3 && hand.length <= 3) return { act: 'skill', id: 'kurou', cardIds: [], targets: [] };
    if (s.id === 'lijian') { const m = oth(sel.targets.list).filter((q) => w(q) >= 0.5).sort((a, b) => w(b) - w(a)); if (m.length >= 2) return { act: 'skill', id: 'lijian', cardIds: [lowest(g, p, sel.cards.list, 1)[0]], targets: [m[0].seat, m[1].seat] }; }
    if (s.id === 'jieyin') return { act: 'skill', id: 'jieyin', cardIds: lowest(g, p, sel.cards.list, 2), targets: [sel.targets.list[0]] };
    if (s.id === 'sacrifice') { const t = oth(sel.targets.list).filter((q) => q === p || ally(g, p, q)).sort((a, b) => a.hp - b.hp)[0]; if (t && hand.length >= 3) return { act: 'skill', id: 'sacrifice', cardIds: lowest(g, p, sel.cards.list, 1), targets: [t.seat] }; }
    if (s.id === 'loan' && hand.length >= 2) { const t = oth(sel.targets.list).filter((q) => w(q) >= 0.5)[0]; if (t && t.hp >= 2) return { act: 'skill', id: 'loan', cardIds: [], targets: [t.seat] }; }
  }
  return { act: 'end' };
}

module.exports = { decide, want, ally };
