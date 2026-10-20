const { Game } = require('../server/engine.js');
const bot = require('../server/bot.js');
(async () => {
  for (let i = 0; i < 600; i++) {
    const n = 2 + (i % 9); let g; const lines = [];
    const io = { log(m) { lines.push(m); }, sync: async () => {}, pause: async () => {}, ask: async (s, r) => bot.decide(g, s, r), reveal() {} };
    g = new Game({ io, seed: 1000 + i, players: Array.from({ length: n }, (_, k) => ({ name: 'B' + (k + 1), isBot: true })) });
    // ตรวจทุกครั้งที่ sync
    let bad = null;
    const origTurn = g.takeTurn.bind(g); g.takeTurn = async (p) => { chk(); return origTurn(p); };
    function chk() { if (bad) return; let tot = g.deck.length + g.discard.length; for (const p of g.players) tot += p.hand.length + p.delayed.length + Object.values(p.equip).filter(Boolean).length; if (tot !== 108) { bad = { tot, at: lines.length }; } }
    await g.run();
    let tot = g.deck.length + g.discard.length; for (const p of g.players) tot += p.hand.length + p.delayed.length + Object.values(p.equip).filter(Boolean).length;
    if (tot !== 108) { console.log('seed', 1000 + i, 'n', n, 'first bad', bad); console.log(lines.slice(Math.max(0, (bad ? bad.at : lines.length) - 14), (bad ? bad.at : lines.length) + 2).join('\n')); process.exit(); }
  }
})();
