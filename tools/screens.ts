/**
 * The screenshot gallery (spec §17.4): `npm run qa:screens` builds the game and captures every scene in every
 * region and weather it can appear in, the HUD solo and co-op, ALERT, low Skin, low Integrity, the finale and
 * its endings, into qa/screenshots/ with a generated index.html. Every shot is palette-checked (main palette,
 * or both for the sunrise crossfade), and console errors or warnings are recorded beside it.
 *   npx tsx tools/screens.ts [--dev] [--only name-prefix]
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { REGION_WEATHER } from '../src/content/regions';
import type { Region } from '../src/core/types';
import { openScene, saveDataUrl, startSession } from './browser';

interface Shot {
  name: string;
  caption: string;
  query: string;
  ticks?: number;
  /** JS run in the page before the ticks. */
  eval?: string;
  palette?: 'main' | 'epilogue' | 'both';
}

const REGIONS = Object.keys(REGION_WEATHER) as Region[];
const STOPS = ['depot', 'diner', 'gas'] as const;

function shots(): Shot[] {
  const out: Shot[] = [
    { name: 'title', caption: 'Title', query: 'scene=title', ticks: 150 },
    { name: 'join-1p', caption: 'Join, one player', query: 'scene=join', ticks: 30 },
    { name: 'join-2p', caption: 'Join, two players', query: 'scene=join&players=2', ticks: 30 },
    { name: 'intro', caption: 'Intro, the first line', query: 'scene=intro', ticks: 240 },
    { name: 'tutorial', caption: 'Night one (the tutorial)', query: 'scene=tutorial', ticks: 150 },
    { name: 'map', caption: 'The map', query: 'scene=map', ticks: 90 },
  ];
  for (const region of REGIONS) {
    for (const weather of REGION_WEATHER[region]) {
      out.push({
        name: `drive-${region}-${weather}`,
        caption: `Drive · ${region} · ${weather}`,
        query: `scene=drive&region=${region}&weather=${weather}`,
        ticks: 150,
      });
    }
  }
  let v = 0;
  for (const stop of STOPS) {
    for (const region of REGIONS) {
      for (const weather of REGION_WEATHER[region]) {
        out.push({
          name: `${stop}-${region}-${weather}`,
          caption: `${stop} ${v % 2 === 0 ? 'A' : 'B'} · ${region} · ${weather}`,
          query: `scene=${stop}&region=${region}&weather=${weather}&variant=${v % 2}&seed=${3 + v}`,
          ticks: 120,
        });
        v++;
      }
    }
  }
  for (let i = 0; i < 3; i++)
    out.push({
      name: `station-${i}`,
      caption: `Station interior ${i + 1}`,
      query: `scene=station&variant=${i}`,
      ticks: 120,
    });
  out.push(
    { name: 'compromised', caption: 'A compromised Station', query: 'scene=compromised', ticks: 120 },
    { name: 'checkpoint', caption: 'Checkpoint (the queue)', query: 'scene=checkpoint', ticks: 120 },
    { name: 'port', caption: 'The Port (the lot)', query: 'scene=port', ticks: 120 },
    {
      name: 'port-berth',
      caption: 'The Port (the berth)',
      query: 'scene=port',
      ticks: 60,
      eval: '(() => { const s = window.__exodus.game.scenes.current; s.sim.members.forEach((m, i) => { m.x = m.px = 43 + i; m.y = m.py = 15; s.sim.port.gatePassed.add(i); }); s.rig.teleport(42, 8, 1); })()',
    },
    {
      name: 'port-yard',
      caption: 'The Port (the yard)',
      query: 'scene=port',
      ticks: 60,
      eval: '(() => { const s = window.__exodus.game.scenes.current; s.sim.members.forEach((m, i) => { m.x = m.px = 30 + i; m.y = m.py = 34; }); s.rig.teleport(30, 37, 1); })()',
    },
  );
  for (const region of REGIONS)
    out.push({
      name: `camp-${region}`,
      caption: `Camp · ${region}`,
      query: `scene=camp&region=${region}`,
      ticks: 400,
    });
  out.push(
    { name: 'hud-coop', caption: 'HUD, two players', query: 'scene=depot&players=2&seed=5', ticks: 120 },
    { name: 'hud-alert', caption: 'HUD, ALERT', query: 'scene=depot&alert=1&seed=5', ticks: 120 },
    { name: 'hud-low-skin', caption: 'HUD, low Skin', query: 'scene=diner&skin=15&seed=5', ticks: 120 },
    {
      name: 'hud-low-integrity',
      caption: 'HUD, low Integrity',
      query: 'scene=gas&integrity=25&seed=5',
      ticks: 300,
    },
    {
      name: 'voyage-night',
      caption: 'The voyage, night',
      query: 'scene=voyage',
      ticks: 300,
      palette: 'main',
    },
    {
      name: 'voyage-dawn',
      caption: 'The voyage, sunrise',
      query: 'scene=voyage',
      ticks: 1500,
      eval: 'window.__exodus.game.scenes.current.skipTalk?.()',
      palette: 'both',
    },
    { name: 'ghana-quay', caption: 'Tema', query: 'scene=ending', ticks: 300, palette: 'epilogue' },
    {
      name: 'ghana-coop',
      caption: 'The cooperative',
      query: 'scene=ending&tag=coop',
      ticks: 700,
      palette: 'epilogue',
    },
    {
      name: 'gameover-lost',
      caption: 'Game over: no one made it',
      query: 'scene=gameover&tag=allLost',
      ticks: 360,
    },
    {
      name: 'gameover-sailed',
      caption: 'Game over: the ship sailed',
      query: 'scene=gameover&tag=shipSailed',
      ticks: 360,
    },
  );
  return out;
}

function html(rows: { shot: Shot; off: number; total: number; messages: string[] }[]): string {
  const cells = rows
    .map(({ shot, off, total, messages }) => {
      const pal = off === 0 ? 'on palette' : `${off} of ${total} pixels off palette`;
      const notes = messages.length ? `<pre>${messages.join('\n').replace(/</g, '&lt;')}</pre>` : '';
      return `<figure><a href="${shot.name}.png"><img src="${shot.name}_low.png" alt="${shot.caption}"></a><figcaption>${shot.caption}<br><small>${pal}</small></figcaption>${notes}</figure>`;
    })
    .join('\n');
  return `<!doctype html>
<meta charset="utf-8">
<title>EXODUS.EXE screenshots</title>
<style>
body { background: #0e1013; color: #d8dde3; font: 13px/1.4 system-ui, sans-serif; margin: 16px; }
main { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 16px; }
img { width: 100%; image-rendering: pixelated; display: block; }
figure { margin: 0; }
small { color: #8a939c; }
pre { color: #e8364f; white-space: pre-wrap; }
</style>
<h1>EXODUS.EXE screenshot gallery</h1>
<p>Generated by <code>npm run qa:screens</code> (spec §17.4). Thumbnails are the 640×360 final low-res frames; click for the full window.</p>
<main>
${cells}
</main>
`;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const dev = argv.includes('--dev');
  const only = argv.includes('--only') ? argv[argv.indexOf('--only') + 1] : null;
  const dir = 'qa/screenshots';
  await mkdir(dir, { recursive: true });
  const s = await startSession(dev ? 'dev' : 'preview');
  const rows: { shot: Shot; off: number; total: number; messages: string[] }[] = [];
  let failed = 0;
  try {
    for (const shot of shots()) {
      if (only && !shot.name.startsWith(only)) continue;
      const { page, messages } = await s.newPage(1280, 720);
      try {
        await openScene(page, s.url, 'qa=1&' + shot.query);
        if (shot.eval) await page.evaluate(shot.eval);
        if (shot.ticks) {
          await page.evaluate((k) => window.__exodus?.runTicks(k), shot.ticks);
          await page.evaluate(() => window.__exodus?.renderNow());
        }
        await page.screenshot({ path: `${dir}/${shot.name}.png` });
        await saveDataUrl(
          await page.evaluate(() => window.__exodus!.lowResPng()),
          `${dir}/${shot.name}_low.png`,
        );
        const pal = await page.evaluate((p) => window.__exodus!.paletteCheck(p), shot.palette ?? 'main');
        rows.push({ shot, off: pal.off, total: pal.total, messages: [...messages] });
        if (pal.off > 0 || messages.length > 0) failed++;
        console.log(
          `${shot.name.padEnd(34)} ${pal.off === 0 ? 'on palette' : `${pal.off} off`}${messages.length ? ` · ${messages.length} console messages` : ''}`,
        );
      } catch (e) {
        failed++;
        rows.push({ shot, off: -1, total: 0, messages: [String(e)] });
        console.log(`${shot.name.padEnd(34)} FAILED: ${String(e)}`);
      } finally {
        await page.context().close();
      }
    }
  } finally {
    await s.close();
  }
  await writeFile(`${dir}/index.html`, html(rows));
  console.log(`${rows.length} shots → ${dir}/index.html${failed ? ` (${failed} with problems)` : ''}`);
  if (failed > 0) process.exitCode = 1;
}

void main();
