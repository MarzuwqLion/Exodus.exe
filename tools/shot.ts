/**
 * Development helper: render one scene in Chrome and save screenshots.
 *   npx tsx tools/shot.ts "scene=street&weather=snow" qa/tmp/street [--dev] [--size=1920x1080] [--ticks=N]
 * Writes <out>.png (full canvas) and <out>_low.png (the 640×360 final low-res frame), and prints console
 * errors, palette check, and renderer stats.
 */
import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { openScene, saveDataUrl, startSession } from './browser';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const query = args[0] ?? 'scene=street';
  const out = args[1] ?? 'qa/tmp/shot';
  const dev = args.includes('--dev');
  const sizeArg = args.find((a) => a.startsWith('--size='));
  const ticksArg = args.find((a) => a.startsWith('--ticks='));
  const [w, h] = (sizeArg?.split('=')[1] ?? '1280x720').split('x').map(Number);
  await mkdir(dirname(out), { recursive: true });
  const s = await startSession(dev ? 'dev' : 'preview');
  try {
    const { page, messages } = await s.newPage(w, h);
    await openScene(page, s.url, 'qa=1&' + query);
    if (ticksArg) {
      const n = Number(ticksArg.split('=')[1]);
      await page.evaluate((k) => window.__exodus?.runTicks(k), n);
      await page.evaluate(() => window.__exodus?.renderNow());
    }
    await page.screenshot({ path: out + '.png' });
    await saveDataUrl(await page.evaluate(() => window.__exodus!.lowResPng()), out + '_low.png');
    const pal = await page.evaluate(() => window.__exodus!.paletteCheck('both'));
    const stats = await page.evaluate(() => window.__exodus!.stats());
    console.log(JSON.stringify({ query, palette: pal, stats }, null, 0));
    if (messages.length) console.log('CONSOLE:\n' + messages.join('\n'));
  } finally {
    await s.close();
  }
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
