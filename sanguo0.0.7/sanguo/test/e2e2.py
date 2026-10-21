import asyncio, os, subprocess, sys, time
from playwright.async_api import async_playwright
SHOT = '/tmp/claude-0/-home-claude/bdb19048-3710-52c3-a853-d30af6187d90/scratchpad/shots'
res = {}
async def main():
    env = dict(os.environ, PORT='3112', ASK_TIMEOUT='6000')
    srv = subprocess.Popen(['node', 'server/server.js'], env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    await asyncio.sleep(1.5)
    try:
        async with async_playwright() as p:
            b = await p.chromium.launch(executable_path='/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args=['--no-sandbox'])
            pg = await b.new_page(viewport={'width': 1280, 'height': 800})
            errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
            await pg.goto('http://localhost:3112/'); await pg.fill('#name', 'ทดสอบ')
            await pg.click('[data-a=create]'); await pg.wait_for_selector('[data-a=addbot]')
            for _ in range(3): await pg.click('[data-a=addbot]')
            await pg.click('[data-a=start]')
            # ผ่านการแจ้งบทบาท/เลือกขุนศึก
            for _ in range(200):
                await asyncio.sleep(0.1)
                rk = await pg.query_selector('[data-a=roleok]')
                if rk: await rk.click(); continue
                it = await pg.query_selector('.modal .item')
                if it:
                    await it.click(); go = await pg.query_selector('[data-a=pickgo]:not([disabled])')
                    if go: await go.click(); continue
                if await pg.query_selector('#game'): break
            # รอจนถึงขั้นจั่วไพ่ของเรา (กดกองจั่ว)
            t0 = time.time(); got = False
            while time.time() - t0 < 40:
                await asyncio.sleep(0.2)
                if await pg.query_selector('.deckpile.glow'):
                    await pg.click('.deckpile'); await asyncio.sleep(0.5)
                    got = bool(await pg.query_selector('.fxp.got')); break
            res['3_draw_pile_click_shows_cards'] = got
            # ถึงตาเล่นไพ่
            for _ in range(100):
                await asyncio.sleep(0.2)
                if await pg.query_selector('[data-a=endturn]'): break
            # 1: ปุ่มปิด — ลิงก์ในบันทึก
            link = await pg.query_selector('a.clog')
            if link:
                await link.click(); await asyncio.sleep(0.2)
                opened = bool(await pg.query_selector('.modal .card.lg')) # 8 โมดอลการ์ด
                await pg.click('[data-a=closemodal]'); await asyncio.sleep(0.2)
                res['8_log_link_opens_card'] = opened
                res['1_close_card_modal'] = not await pg.query_selector('.modal')
            # 6: กองทิ้ง
            await pg.click('[data-a=menutoggle]'); await pg.click('.menu [data-a=showdiscard]'); await asyncio.sleep(0.2)
            res['6_discard_modal_opens'] = bool(await pg.query_selector('.modal .cardrow'))
            c = await pg.query_selector('.modal .cardrow [data-cinfo]')
            if c:
                await c.click(); await asyncio.sleep(0.2)
                await pg.click('[data-a=closemodal]'); await asyncio.sleep(0.2)
                back = bool(await pg.query_selector('.modal .cardrow'))
                await pg.click('[data-a=closemodal]'); await asyncio.sleep(0.2)
                res['1_close_discard_chain'] = back and not await pg.query_selector('.modal')
            else:
                await pg.click('[data-a=closemodal]'); res['1_close_discard_chain'] = not await pg.query_selector('.modal')
            await pg.click('.port[data-hero-detail]'); await asyncio.sleep(0.2)
            await pg.click('[data-a=closemodal]'); await asyncio.sleep(0.2)
            res['1_close_hero_modal'] = not await pg.query_selector('.modal')
            # 11: ฟื้นพลังใช้กับตัวเองได้ (จำลองคำขอ play)
            r = await pg.evaluate('''() => {
              const v = S.view, you = v.you; const sent = [];
              S.ws.send = (m) => sent.push(JSON.parse(m));
              v.hand.unshift({ id: 9999, key: 'heal', suit: 'C', num: 5 });
              v.players[you].hp = 1; v.players[you].maxHp = 4;
              S.ask = { id: 77, deadline: Date.now() + 5000, req: { type: 'play', skills: [], uses: { 9999: [{ label: 'ใช้ ฟื้นพลัง', kind: 'targets', targets: [you], min: 1, max: 1, as: 'heal' }] } } };
              S.sel = {}; S.preview = null; S.handOpen = true; render();
              document.querySelector('.hand .card[data-card="9999"]').click();
              document.querySelector('[data-a=previewok]').click();
              const tgt = document.querySelector('.seat.me-seat.targetable') ? 'targetable' : 'no';
              document.querySelector('.seat.me-seat').click();
              return { tgt, sent };
            }''')
            res['11_heal_self_clickable'] = r['tgt'] == 'targetable'
            res['11_heal_self_sent'] = any(m.get('t') == 'answer' and m['ans'].get('targets') and m['ans']['cardId'] == 9999 for m in r['sent'])
            await pg.screenshot(path=f'{SHOT}/V_heal.png')
            res['js_errors'] = errs[:3]
            await b.close()
    finally:
        srv.terminate()
    for k, v in res.items(): print(('OK  ' if v is True or v == [] else 'FAIL' if v is False else 'INFO'), k, v)
asyncio.run(main())
