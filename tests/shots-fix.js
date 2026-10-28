// Re-capture login heading and the AI/Help panel close buttons after the branding/encoding fix.
const { browser, passGate, login, BASE } = require('./lib');
(async () => {
  const { b, page } = await browser({ width: 1366, height: 768 });
  await passGate(page); await page.waitForSelector('#username'); await page.waitForTimeout(3000);
  console.log('LOGIN TEXT:', (await page.innerText('body')).match(/[A-Z ]*LOGIN/) && (await page.innerText('body')).match(/[A-Z ]*LOGIN/)[0]);
  await page.screenshot({ path: '/t/out/r-01-login.png' });
  await login(page, 'demo.doctor', 'arsenal');
  await page.goto(BASE + '/bahmni-v2/registration/search', { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(2500);
  await page.click('#vipers-root .vp-help-btn'); await page.waitForTimeout(500);
  console.log('HELP CLOSE + LINKS:', JSON.stringify(await page.locator('#vipers-root .vp-help .vp-x').innerText()), JSON.stringify(await page.locator('#vipers-root .vp-more').innerText()));
  await page.screenshot({ path: '/t/out/wf-ai-1-help-panel.png' });
  await page.click('#vipers-root .vp-help .vp-x');
  await page.click('#vipers-root .vp-ai-btn'); await page.locator('#vipers-root .vp-chip').first().click();
  await page.locator('#vipers-root .vp-msg.vp-bot').nth(1).waitFor({ timeout: 30000 }); await page.waitForTimeout(500);
  console.log('AI CLOSE:', JSON.stringify(await page.locator('#vipers-root .vp-ai .vp-x').innerText()));
  await page.screenshot({ path: '/t/out/wf-ai-2-panel-answer.png' });
  await b.close();
})();
