/**
 * Visual verification (spec §17.4) that needs a real browser:
 * - palette test: every pixel of the final low-res output is in the active palette
 * - shimmer test: panning a static scene in sub-texel steps keeps static edges pixel-identical
 * Exported for the screenshot runner; also runnable alone: `npx tsx tools/visualtests.ts [--dev]`.
 */
import type { Page } from 'playwright';
import { openScene, startSession } from './browser';

export interface VisualResult {
  name: string;
  pass: boolean;
  detail: string;
}

export async function shimmerTests(page: Page, base: string): Promise<VisualResult[]> {
  const out: VisualResult[] = [];
  await openScene(page, base, 'qa=1&scene=street&weather=clear&nohud=1&seed=7');
  // Snapping on, no vignette: frames inside a texel cell are identical; across cells the image shifts rigidly.
  const on = await page.evaluate(() => window.__exodus!.shimmer(48, 0.23));
  out.push({
    name: 'shimmer: snapped pan, static edges identical (fog and vignette off)',
    pass: on.mismatched === 0 && on.inCellFailures === 0 && on.identicalInCell > 0 && on.shiftedCompared > 0,
    detail: JSON.stringify(on),
  });
  // With the screen-anchored vignette and fog on, only pixels where those gradients cross a palette step may
  // change when the image shifts by a whole texel.
  const vig = await page.evaluate(() => window.__exodus!.shimmer(48, 0.23, { vignette: true, fog: true }));
  const frac = vig.comparedPixels > 0 ? vig.mismatched / vig.comparedPixels : 1;
  out.push({
    name: 'shimmer: snapped pan with vignette and fog (in-cell identical; < 1.5% of pixels change per texel step from screen-anchored gradients)',
    pass: frac < 0.015 && vig.inCellFailures === 0,
    detail: JSON.stringify({ ...vig, fraction: frac }),
  });
  // Control: with snapping off, sub-texel pans must change pixels (proves the test can fail).
  await page.evaluate(() => {
    const v = window.__exodus!.game.scenes.current!.world()!;
    v.rig.snap = false;
  });
  const off = await page.evaluate(() => window.__exodus!.shimmer(24, 0.23));
  out.push({
    name: 'shimmer control: unsnapped pan shimmers',
    pass: off.mismatched > 0,
    detail: JSON.stringify({ mismatched: off.mismatched, identicalInCell: off.identicalInCell }),
  });
  return out;
}

export async function paletteTest(
  page: Page,
  base: string,
  query: string,
  palette: 'main' | 'epilogue' | 'both' = 'main',
): Promise<VisualResult> {
  await openScene(page, base, 'qa=1&' + query);
  const r = await page.evaluate((p) => window.__exodus!.paletteCheck(p), palette);
  return {
    name: `palette: ${query}`,
    pass: r.off === 0,
    detail: `${r.off} of ${r.total} pixels off-palette`,
  };
}

async function main(): Promise<void> {
  const dev = process.argv.includes('--dev');
  const s = await startSession(dev ? 'dev' : 'preview');
  let failed = 0;
  try {
    const { page, messages } = await s.newPage(1280, 720);
    const results = [
      ...(await shimmerTests(page, s.url)),
      await paletteTest(page, s.url, 'scene=street&weather=snow'),
    ];
    for (const r of results) {
      if (!r.pass) failed++;
      console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}\n      ${r.detail}`);
    }
    if (messages.length) {
      failed++;
      console.log('CONSOLE:\n' + messages.join('\n'));
    }
  } finally {
    await s.close();
  }
  process.exit(failed ? 1 : 0);
}

if (process.argv[1]?.endsWith('visualtests.ts')) {
  main().catch((e: unknown) => {
    console.error(e);
    process.exit(1);
  });
}
