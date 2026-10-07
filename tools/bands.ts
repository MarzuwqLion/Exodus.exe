/**
 * Parallel bot bands for tuning (not a test). Runs band cases across worker processes:
 *   npx tsx tools/bands.ts [--n 100] [--first 0] [--jobs 18] [--detail] [--set path=value]... [--patch file]
 *     [stop:kind:players]...
 * e.g. `npx tsx tools/bands.ts --n 400 --set awareness.lingerRateMax=8 depot:cautious:1 gas:greedy:2`.
 * Attempts `first … first+n-1` are the same cases the band tests use (0 … 99). With no cases it runs every
 * stop type × cautious/greedy × solo/two-player. `--detail` adds per-layout and per-region lines. `--patch`
 * names a module whose default export edits the layouts before the runs (to try layout changes).
 */
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { runStopBots, summarize, type StopRunResult } from '../src/bots/runner';
import type { StopBotKind } from '../src/bots/stopbots';
import { TUNING } from '../src/content/tuning';
import { bandCase, layoutsFor } from './botstats';

interface Row extends StopRunResult {
  i: number;
  layout: string;
  region: string;
}

function setPath(path: string, value: number): void {
  const parts = path.split('.');
  let o = TUNING as unknown as Record<string, unknown>;
  for (let i = 0; i < parts.length - 1; i++) o = o[parts[i]] as Record<string, unknown>;
  if (typeof o[parts[parts.length - 1]] !== 'number') throw new Error(`not a number: ${path}`);
  o[parts[parts.length - 1]] = value;
}

async function worker(args: string[]): Promise<void> {
  const [which, kind, players, from, to, ...sets] = args;
  for (const s of sets) {
    if (s.startsWith('patch:')) {
      const mod = (await import(pathToFileURL(s.slice(6)).href)) as { default: () => void };
      mod.default();
      continue;
    }
    const [path, v] = s.split('=');
    setPath(path, Number(v));
  }
  const layouts = layoutsFor(which);
  for (let i = Number(from); i < Number(to); i++) {
    const c = bandCase(i, layouts);
    const r = runStopBots({ ...c, kind: kind as StopBotKind, players: players === '2' ? 2 : 1 });
    process.stdout.write(JSON.stringify({ ...r, i, layout: c.layout.id, region: c.region }) + '\n');
  }
}

function line(name: string, rows: readonly Row[]): string {
  const s = summarize(rows);
  const pct = (v: number): string => `${(v * 100).toFixed(0)}%`;
  return (
    `${name.padEnd(20)} n ${String(s.n).padStart(4)}  exp ${pct(s.exposure).padStart(4)}  cells ${s.meanCells.toFixed(1).padStart(4)}` +
    `  parts ${s.meanParts.toFixed(1)}  car ${s.meanCar.toFixed(0).padStart(2)}  t ${s.meanSeconds.toFixed(0).padStart(3)}` +
    `  skin ${pct(s.skinRate)}  papers ${pct(s.papersRate)}  lost ${pct(s.lostRate)}  timeouts ${s.timeouts}`
  );
}

function runChunk(self: string, args: string[], into: Row[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn(process.execPath, ['--import', 'tsx', self, '--worker', ...args], {
      stdio: ['ignore', 'pipe', 'inherit'],
    });
    let buf = '';
    p.stdout.on('data', (d: Buffer) => {
      buf += d.toString();
      let k = buf.indexOf('\n');
      while (k >= 0) {
        const l = buf.slice(0, k).trim();
        if (l) into.push(JSON.parse(l) as Row);
        buf = buf.slice(k + 1);
        k = buf.indexOf('\n');
      }
    });
    p.on('error', reject);
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`worker exited ${code}`))));
  });
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  let n = 100;
  let first = 0;
  let jobs = 18;
  let detail = false;
  const sets: string[] = [];
  const cases: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--n') n = Number(argv[++i]);
    else if (a === '--first') first = Number(argv[++i]);
    else if (a === '--jobs') jobs = Number(argv[++i]);
    else if (a === '--set') sets.push(argv[++i]);
    else if (a === '--patch') sets.push('patch:' + argv[++i]);
    else if (a === '--detail') detail = true;
    else cases.push(a);
  }
  if (cases.length === 0) {
    for (const stop of ['depot', 'diner', 'gas'])
      for (const kind of ['cautious', 'greedy'])
        for (const p of ['1', '2']) cases.push(`${stop}:${kind}:${p}`);
  }
  const self = fileURLToPath(import.meta.url);
  const t0 = Date.now();
  // Every case is split into chunks; a pool of `jobs` workers runs the chunks.
  const chunk = Math.max(5, Math.ceil(n / Math.max(1, Math.floor(jobs / cases.length))));
  const tasks: { c: number; args: string[] }[] = [];
  cases.forEach((cs, c) => {
    const [stop, kind = 'cautious', players = '1'] = cs.split(':');
    for (let from = first; from < first + n; from += chunk)
      tasks.push({
        c,
        args: [stop, kind, players, String(from), String(Math.min(first + n, from + chunk)), ...sets],
      });
  });
  const rows: Row[][] = cases.map(() => []);
  let next = 0;
  const lanes = Array.from({ length: Math.min(jobs, tasks.length) }, async () => {
    while (next < tasks.length) {
      const t = tasks[next++];
      await runChunk(self, t.args, rows[t.c]);
    }
  });
  await Promise.all(lanes);
  console.log(
    `${sets.join(' ') || 'baseline'} (n ${n} from ${first}, ${((Date.now() - t0) / 1000).toFixed(0)} s)`,
  );
  cases.forEach((cs, c) => {
    const rs = rows[c].sort((a, b) => a.i - b.i);
    console.log(line(cs, rs));
    if (!detail) return;
    for (const id of [...new Set(rs.map((r) => r.layout))])
      console.log(
        line(
          `  ${id}`,
          rs.filter((r) => r.layout === id),
        ),
      );
    for (const reg of [...new Set(rs.map((r) => r.region))])
      console.log(
        line(
          `  ${reg}`,
          rs.filter((r) => r.region === reg),
        ),
      );
  });
}

if (process.argv[2] === '--worker') void worker(process.argv.slice(3));
else void main();
