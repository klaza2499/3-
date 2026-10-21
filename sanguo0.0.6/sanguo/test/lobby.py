import asyncio
from playwright.async_api import async_playwright
D='/tmp/claude-0/-home-claude/bdb19048-3710-52c3-a853-d30af6187d90/scratchpad/shots/'
async def main():
    async with async_playwright() as p:
        b=await p.chromium.launch(executable_path='/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args=['--no-sandbox'])
        errs=[]
        a=await (await b.new_context(viewport={'width':1100,'height':800})).new_page(); a.on('pageerror',lambda e:errs.append(str(e)))
        c=await (await b.new_context(viewport={'width':1100,'height':800})).new_page(); c.on('pageerror',lambda e:errs.append(str(e)))
        for pg,n in ((a,'เจ้าของ'),(c,'เพื่อน')):
            await pg.goto('http://localhost:3115/'); await pg.fill('#name',n)
        await a.fill('#rtitle','ห้องทดสอบ'); await a.click('[data-a=create]'); await a.wait_for_selector('[data-a=addbot]')
        await asyncio.sleep(.8)
        await c.screenshot(path=D+'lobby.png')
        print('rows seen by friend:', await c.locator('.roomrow').count())
        await c.click('[data-a=joinroom]'); await c.wait_for_selector('.member')
        print('members:', await a.locator('.member').count())
        # ห้องส่วนตัวไม่โผล่
        await c.click('[data-a=leave]') if False else None
        await a.click('[data-a=addbot]'); await a.click('[data-a=start]')
        for i in range(60):
            await asyncio.sleep(.3)
            if await a.query_selector('#game'): break
        # เปิดปิดบันทึก
        JS='''()=>{const q=s=>document.querySelector(s);if(q('[data-a=roleok]')){q('[data-a=roleok]').click();return 'x'}const it=q('.modal .item');if(it){it.click();const g=q('[data-a=pickgo]:not([disabled])');if(g)g.click();return 'x'}return q('.banner')?'ok':''}'''
        async def drive():
            for i in range(200):
                await asyncio.sleep(.2); await c.evaluate(JS)
        t=asyncio.create_task(drive())
        for pg in (a,):
            for i in range(80):
                await asyncio.sleep(.3)
                r=await pg.evaluate('''()=>{const q=s=>document.querySelector(s);if(q('[data-a=roleok]')){q('[data-a=roleok]').click();return 'x'}const it=q('.modal .item');if(it){it.click();const g=q('[data-a=pickgo]:not([disabled])');if(g)g.click();return 'x'}return q('.banner')?'ok':''}''')
                if r=='ok': break
            await asyncio.sleep(1)
            print('log visible', await pg.locator('.log').is_visible())
            await pg.click('[data-a=togglelog]'); print('after toggle', await pg.locator('.log').is_visible())
            await pg.click('[data-a=togglelog]'); print('again', await pg.locator('.log').is_visible())
        print('errs', errs); await b.close()
asyncio.run(main())
