/**
 * A complete run in the browser, scene by scene (spec §20: title, tutorial, Boston, the road south, the Port,
 * the voyage, Ghana, and back to the title), driven through the real scene flow: keys where a player would
 * press them, the scenes' own debug skips (F3's hook) to get through each stop, and at the Port the party walked
 * up the gangway. Fails on any console error or warning, a soft lock (a scene that won't move on), or a run
 * that doesn't end where it should.
 *   npx tsx tools/playthrough.ts [--players 2] [--ending ghana|lost|missed] [--dev]
 */
import { openScene, startSession } from './browser';

type Ending = 'ghana' | 'lost' | 'missed';

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const players = argv.includes('--players') ? Number(argv[argv.indexOf('--players') + 1]) : 1;
  const ending = (argv.includes('--ending') ? argv[argv.indexOf('--ending') + 1] : 'ghana') as Ending;
  const s = await startSession(argv.includes('--dev') ? 'dev' : 'preview');
  const seen: string[] = [];
  let failure: string | null = null;
  try {
    const { page, messages } = await s.newPage(1280, 720);
    await openScene(page, s.url, 'qa=1&scene=title&seed=11');
    const scene = (): Promise<string> => page.evaluate(() => window.__exodus!.scene());
    const press = async (key: string): Promise<void> => {
      await page.keyboard.down(key);
      await page.waitForTimeout(50);
      await page.keyboard.up(key);
      await page.evaluate(() => window.__exodus!.runTicks(8));
    };
    let last = '';
    let stuck = 0;
    for (let step = 0; step < 400; step++) {
      const id = await scene();
      if (id !== last) {
        seen.push(id);
        last = id;
        stuck = 0;
      } else if (++stuck > 40) {
        failure = `stuck in ${id}`;
        break;
      }
      if (id === 'title') {
        if (seen.filter((x) => x === 'title').length > 1 && seen.length > 3) break; // back at the title: done
        if (players === 2) await page.keyboard.press('Backspace');
        await press('KeyE');
        await press('KeyE');
      } else if (id === 'join') {
        if (players === 2 && !(await page.evaluate(() => window.__exodus!.game.input.isJoined(1))))
          await press('Backspace');
        await press('KeyE');
      } else if (id === 'port') {
        // Walk the party up the gangway (or, for the ship-sailed ending, let the clock run out).
        if (ending === 'ghana')
          await page.evaluate(() => {
            const sc = window.__exodus!.game.scenes.current as unknown as {
              sim: { members: { x: number; y: number; px: number; py: number }[] };
            };
            sc.sim.members.forEach((m, i) => {
              m.x = m.px = 44.5 + (i % 2);
              m.y = m.py = 4.5;
            });
          });
        await page.evaluate(() => window.__exodus!.runTicks(ending === 'ghana' ? 60 : 60 * 380));
      } else if (id === 'voyage' || id === 'ending' || id === 'gameover') {
        await page.evaluate(() => {
          const sc = window.__exodus!.game.scenes.current as unknown as { skipTalk?: () => void };
          sc.skipTalk?.();
          window.__exodus!.runTicks(600);
        });
        await press('KeyE');
      } else {
        // Every in-run scene: the debug skip moves it along the way finishing it would.
        if (ending === 'lost' && id !== 'map' && id !== 'drive' && id !== 'camp' && id !== 'intro')
          await page.evaluate(() => {
            const g = window.__exodus!.game;
            const sc = g.scenes.current as unknown as {
              sim?: {
                members: { state: { kind: string; status: string } }[];
                lose: (m: unknown, how: string) => void;
              };
            };
            if (sc.sim)
              for (const m of sc.sim.members) if (m.state.kind === 'android') sc.sim.lose(m, 'reclaimed');
          });
        if (ending === 'missed')
          await page.evaluate(() => {
            const f = window.__exodus!.game.flow;
            if (f) f.run.day = Math.max(f.run.day, 13);
          });
        await page.evaluate(() => {
          (window.__exodus!.game.scenes.current as unknown as { debugSkip?: () => void }).debugSkip?.();
          window.__exodus!.runTicks(90);
        });
      }
      await page.evaluate(() => window.__exodus!.renderNow());
    }
    if (messages.length) failure ??= `console:\n${messages.join('\n')}`;
    const want = ending === 'ghana' ? ['voyage', 'ending'] : ['gameover'];
    for (const w of want) if (!seen.includes(w)) failure ??= `never reached ${w}`;
    if (seen[seen.length - 1] !== 'title') failure ??= `ended in ${seen[seen.length - 1]}, not the title`;
  } finally {
    await s.close();
  }
  console.log(`${players}P, ${ending}: ${seen.join(' → ')}`);
  if (failure) {
    console.log(`FAILED: ${failure}`);
    process.exitCode = 1;
  } else console.log('ok');
}

void main();
