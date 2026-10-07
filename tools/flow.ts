/**
 * Development helper: play a short scripted flow in Chrome and take screenshots along the way.
 *   npx tsx tools/flow.ts "scene=station&seed=1" qa/tmp/flow step...
 * Steps run in order: `eval:JS` (run in the page), `ticks:N` (simulate N ticks now), `key:Code` (press and
 * release a key, then let the game loop see it), `wait:MS`, `shot:name` (saves <out>_<name>.png and
 * <out>_<name>_low.png). Prints console errors at the end.
 */
import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { openScene, saveDataUrl, startSession } from './browser';

async function main(): Promise<void> {
  const [query = 'scene=street', out = 'qa/tmp/flow', ...steps] = process.argv.slice(2);
  await mkdir(dirname(out), { recursive: true });
  const s = await startSession('dev');
  try {
    const { page, messages } = await s.newPage(1280, 720);
    await openScene(page, s.url, 'qa=1&' + query);
    for (const step of steps) {
      const i = step.indexOf(':');
      const kind = step.slice(0, i);
      const arg = step.slice(i + 1);
      if (kind === 'eval') await page.evaluate(arg);
      else if (kind === 'ticks') await page.evaluate(`window.__exodus.runTicks(${Number(arg)})`);
      else if (kind === 'key') {
        await page.keyboard.down(arg);
        await page.waitForTimeout(60);
        await page.keyboard.up(arg);
        await page.waitForTimeout(120);
      } else if (kind === 'wait') await page.waitForTimeout(Number(arg));
      else if (kind === 'shot') {
        await page.evaluate('window.__exodus.renderNow()');
        await page.screenshot({ path: `${out}_${arg}.png` });
        await saveDataUrl(await page.evaluate(() => window.__exodus!.lowResPng()), `${out}_${arg}_low.png`);
      } else throw new Error(`unknown step: ${step}`);
    }
    if (messages.length) console.log('CONSOLE:\n' + messages.join('\n'));
    else console.log('ok');
  } finally {
    await s.close();
  }
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
