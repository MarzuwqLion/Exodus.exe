/**
 * Port bot bands (spec §17.2) across worker processes, for tuning (the band test is tests/bots/port.bots.ts):
 *   npx tsx tools/portbands.ts [--n 100] [--first 0] [--jobs 18] [--set path=value]... [heat:players]...
 * e.g. `npx tsx tools/portbands.ts --n 200 0:1 3:1`. Attempts `first … first+n-1` use the band test's seeds.
 * With no cases it runs Heat 0 and Heat 3, solo and two-player.
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { runPortBots, type PortRunResult } from '../src/bots/portbots';
import { TUNING } from '../src/content/tuning';

interface Row extends Omit<PortRunResult, 'outcome'> {
  i: number;
}

function setPath(path: string, value: number): void {
  const parts = path.split('.');
  let o = TUNING as unknown as Record<string, unknown>;
  for (let i = 0; i < parts.length - 1; i++) o = o[parts[i]] as Record<string, unknown>;
  if (typeof o[parts[parts.length - 1]] !== 'number') throw new Error(`not a number: ${path}`);
  o[parts[parts.length - 1]] = value;
}

function worker(args: string[]): void {
  const [heat, players, from, to, ...sets] = args;
  for (const s of sets) {
    const [path, v] = s.split('=');
    setPath(path, Number(v));
  }
  for (let i = Number(from); i < Number(to); i++) {
    const r = runPortBots({ seed: 1000 + i, heat: Number(heat), players: players === '2' ? 2 : 1 });
    const { outcome: _o, ...rest } = r;
    void _o;
    process.stdout.write(JSON.stringify({ ...rest, i }) + '\n');
  }
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

function line(name: string, rows: readonly Row[]): string {
  const n = rows.length;
  const pct = (k: number): string => `${((k / Math.max(1, n)) * 100).toFixed(0)}%`.padStart(4);
  const ok = rows.filter((r) => r.androidsAboard > 0).length;
  const all = rows.filter((r) => r.androidsAboard === 3).length;
  const exposed = rows.filter((r) => r.exposed).length;
  const t = rows.reduce((s, r) => s + r.seconds, 0) / Math.max(1, n);
  const ends = new Map<string, number>();
  for (const r of rows) ends.set(r.end, (ends.get(r.end) ?? 0) + 1);
  return (
    `${name.padEnd(14)} n ${String(n).padStart(4)}  aboard ${pct(ok)}  all three ${pct(all)}  exposed ${pct(exposed)}` +
    `  t ${t.toFixed(0).padStart(3)}  ${[...ends].map(([k, v]) => `${k} ${v}`).join(', ')}`
  );
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv[0] === '--worker') {
    worker(argv.slice(1));
    return;
  }
  let n = 100;
  let first = 0;
  let jobs = 18;
  const sets: string[] = [];
  const cases: [number, number][] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--n') n = Number(argv[++i]);
    else if (a === '--first') first = Number(argv[++i]);
    else if (a === '--jobs') jobs = Number(argv[++i]);
    else if (a === '--set') sets.push(argv[++i]);
    else {
      const [h, p] = a.split(':').map(Number);
      cases.push([h, p || 1]);
    }
  }
  if (cases.length === 0) cases.push([0, 1], [0, 2], [3, 1], [3, 2]);
  const self = fileURLToPath(import.meta.url);
  const per = Math.max(1, Math.ceil((n * cases.length) / jobs));
  const results = new Map<string, Row[]>();
  const tasks: (() => Promise<void>)[] = [];
  for (const [h, p] of cases) {
    const rows: Row[] = [];
    results.set(`heat ${h} ${p}P`, rows);
    for (let a = first; a < first + n; a += per) {
      const b = Math.min(first + n, a + per);
      tasks.push(() => runChunk(self, [String(h), String(p), String(a), String(b), ...sets], rows));
    }
  }
  // A pool of at most `jobs` workers.
  let next = 0;
  const pool = Array.from({ length: Math.min(jobs, tasks.length) }, async () => {
    while (next < tasks.length) await tasks[next++]();
  });
  await Promise.all(pool);
  for (const [name, rows] of results) console.log(line(name, rows));
}

void main();
