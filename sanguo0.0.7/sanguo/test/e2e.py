import asyncio, sys, random
from playwright.async_api import async_playwright
SHOT = '/tmp/claude-0/-home-claude/bdb19048-3710-52c3-a853-d30af6187d90/scratchpad/shots'
import os; os.makedirs(SHOT, exist_ok=True)

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args=['--no-sandbox'])
        pg = await b.new_page(viewport={'width': 1280, 'height': 800})
        errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.on('console', lambda m: errs.append('console:' + m.text) if m.type == 'error' else None)
        await pg.goto('http://localhost:3111/')
        await pg.fill('#name', 'ทดสอบ')
        await pg.screenshot(path=f'{SHOT}/1_home.png')
        await pg.click('[data-a=create]')
        await pg.wait_for_selector('[data-a=addbot]')
        for _ in range(4): await pg.click('[data-a=addbot]')
        await pg.screenshot(path=f'{SHOT}/2_room.png')
        await pg.click('[data-a=start]')
        steps = 0; shots = 0
        for i in range(4000):
            await asyncio.sleep(0.05)
            if await pg.query_selector('.modal h2:has-text("ชนะ")'): break
            rk = await pg.query_selector('[data-a=roleok]')
            if rk:
                if shots < 1: await pg.screenshot(path=f'{SHOT}/R_role.png')
                await rk.click(); continue
            pvk = await pg.query_selector('[data-a=previewok]')
            if pvk:
                if shots < 99 and not os.path.exists(f'{SHOT}/R_preview.png'): await pg.screenshot(path=f'{SHOT}/R_preview.png')
                await pvk.click(); continue
            dp = await pg.query_selector('.banner [data-a=drawpile]')
            if dp: await dp.click(); continue
            # โมดอลเลือก (ขุนศึก/เลือกอื่นๆ)
            item = await pg.query_selector('.modal .item')
            if item:
                items = await pg.query_selector_all('.modal .item')
                await random.choice(items).click()
                go = await pg.query_selector('[data-a=pickgo]:not([disabled])')
                if go: await go.click()
                if shots < 6: await pg.screenshot(path=f'{SHOT}/3_pick{shots}.png'); shots += 1
                continue
            if await pg.query_selector('[data-a=arrgo]'): await pg.click('[data-a=arrgo]'); continue
            steps += 1
            if steps == 40: await pg.screenshot(path=f'{SHOT}/4_game.png')
            if steps == 400: await pg.screenshot(path=f'{SHOT}/5_game_late.png')
            ban = await pg.query_selector('.banner:not(.idle)')
            if not ban: continue
            txt = await ban.inner_text()
            # ถ้าเป็นตาเรา: พยายามเล่นไพ่แบบสุ่มเล็กน้อย
            if await pg.query_selector('[data-a=endturn]'):
                cards = await pg.query_selector_all('.hand .card.ok')
                if cards and random.random() < 0.7:
                    await random.choice(cards).click()
                    for _ in range(3):
                        u = await pg.query_selector('[data-use]')
                        if u: await u.click(); break
                    tg = await pg.query_selector_all('.seat.targetable')
                    if tg:
                        await random.choice(tg).click()
                        ok = await pg.query_selector('[data-a=usego]:not([disabled])')
                        if ok: await ok.click()
                    else:
                        c = await pg.query_selector('[data-a=cancelsel]')
                        if c: await c.click()
                else:
                    await pg.click('[data-a=endturn]')
                continue
            for sel in ['[data-a=respgo]:not([disabled])', '[data-a=cardsgo]:not([disabled])']:
                pass
            if await pg.query_selector('[data-a=yes]'): await pg.click('[data-a=yes]'); continue
            cards = await pg.query_selector_all('.hand .card.ok')
            if cards:
                await random.choice(cards).click()
                g = await pg.query_selector('[data-a=cardsgo]:not([disabled])')
                if g: await g.click()
                continue
            for sel in ['[data-a=pass]', '[data-a=pass0]']:
                e = await pg.query_selector(sel)
                if e: await e.click(); break
        await pg.screenshot(path=f'{SHOT}/6_end.png')
        print('steps', steps, 'errors', errs[:5])
        await b.close()
asyncio.run(main())
