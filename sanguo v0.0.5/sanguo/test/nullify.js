// ทดสอบ: ยกเลิกอุบายหลายคน + หวนอสรพิษโจมตีในตา
const { Game } = require('../server/engine.js');
const bot = require('../server/bot.js');
let setupDone = false;
(async () => {
  const asks = []; const cancels = []; let g;
  const io = { log() {}, sync: async () => {}, pause: async () => {}, reveal() {}, fx() {}, cancel: (s) => cancels.push(s),
    ask: async (seat, req) => { if (!setupDone) return bot.decide(g, seat, req); asks.push([seat, req.need || req.type]); if (req.need === 'nullify') { if (seat === 2) return { cardIds: [req.eligible[0]] }; return null; } if (req.need) return null; return null; } };
  g = new Game({ io, seed: 5, players: [0, 1, 2, 3].map((k) => ({ name: 'p' + k, isBot: true })) });
  await g.setup(); setupDone = true;
  const take = (p, key) => { const i = g.deck.findIndex((c) => c.key === key); const c = g.deck.splice(i, 1)[0]; p.hand.push(c); return c; };
  const [p0, p1, p2, p3] = g.players;
  for (const p of g.players) { p.hand = []; p.hp = p.maxHp = 4; }
  take(p1, 'nullify'); take(p2, 'nullify'); take(p3, 'nullify');
  const hp = g.players.map((p) => p.hp);
  g.ts = { attacks: 0, skills: {} }; g.cur = p0;
  await g.resolveCard(p0, 'arrows', [], { key: 'arrows' });
  console.log('asked', JSON.stringify(asks), 'cancelled', cancels, 'hp same?', g.players.every((p, i) => p.hp === hp[i]));
  console.log('p2 nullify used:', !p2.hand.some((c) => c.key === 'nullify'), 'others keep:', p1.hand.length, p3.hand.length);
  // หวนอสรพิษ
  const w = g.deck.splice(g.deck.findIndex((c) => c.key === 'serpent'), 1)[0]; p0.equip.weapon = w;
  p0.hand = [g.deck.shift(), g.deck.shift()];
  const sl = g.skillList(p0).find((s) => s.id === 'serpentAtk');
  console.log('serpent skill offered:', !!sl, sl && sl.sel.targets.list);
})();
