const { Game } = require('../server/engine.js');
const bot = require('../server/bot.js');
const N = +process.argv[2] || 100;
const fixedN = +process.argv[3] || 0;
let stats = { games: 0, lord: 0, rebel: 0, traitor: 0, draw: 0, rounds: 0, err: 0 };
const errs = {};
(async () => {
  for (let i = 0; i < N; i++) {
    const n = fixedN || 2 + (i % 9);
    let g;
    const io = {
      log() {}, sync: async () => {}, pause: async () => {},
      ask: async (seat, req) => bot.decide(g, seat, req),
      reveal() {},
    };
    g = new Game({ io, seed: 1000 + i, players: Array.from({ length: n }, (_, k) => ({ name: 'บอต' + (k + 1), isBot: true })) });
    try {
      const w = await Promise.race([g.run(), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 20000))]);
      stats.games++; stats[w.side]++; stats.rounds += g.round;
      let tot = g.deck.length + g.discard.length; for (const p of g.players) tot += p.hand.length + p.delayed.length + Object.values(p.equip).filter(Boolean).length;
      if (tot !== 108) { stats.err++; errs['cards=' + tot] = (errs['cards=' + tot] || 0) + 1; }
      const ids = new Set(); const all = [...g.deck, ...g.discard]; for (const p of g.players) all.push(...p.hand, ...p.delayed, ...Object.values(p.equip).filter(Boolean));
      all.forEach((c) => ids.add(c.id)); if (ids.size !== all.length) { stats.err++; errs['duplicate cards'] = (errs['duplicate cards'] || 0) + 1; }
    } catch (e) {
      stats.err++; const k = (e.stack || e.message).split('\n').slice(0, 3).join(' | '); errs[k] = (errs[k] || 0) + 1;
      if (stats.err <= 3) console.log('ERR seed', 1000 + i, 'n', n, e.stack.split('\n').slice(0, 6).join('\n'));
    }
  }
  console.log(stats, 'avg rounds', (stats.rounds / Math.max(1, stats.games)).toFixed(1));
  console.log(errs);
})();
