/**
 * The end of a run (spec §16): who stands at the rail on the voyage and what they say, the Ghana epilogue
 * lines, and the stats screen. Pure functions over RunState and the content banks.
 */
import { EPILOGUE, JUNE_EPILOGUE, VOYAGE_CONVERSATIONS } from '../content/conversations';
import type { VoyageConversation } from '../content/schema';
import type { AndroidId, MemberId, RunState, RunStats } from '../core/types';

const ANDROIDS: readonly AndroidId[] = ['wren', 'brick', 'vesper'];

/** The voyage conversation for exactly who made it aboard; null if no android did. */
export function voyageFor(aboard: readonly MemberId[]): VoyageConversation | null {
  const survivors = ANDROIDS.filter((id) => aboard.includes(id));
  const withJune = aboard.includes('june');
  return (
    VOYAGE_CONVERSATIONS.find(
      (v) =>
        v.withJune === withJune &&
        v.survivors.length === survivors.length &&
        v.survivors.every((s, i) => s === survivors[i]),
    ) ?? null
  );
}

/** Who sailed, in party order: every android not lost, and June if she's still with the party. */
export function sailedMembers(run: RunState): MemberId[] {
  return run.party
    .filter((m) => (m.kind === 'android' ? m.status !== 'lost' : m.status === 'active'))
    .map((m) => m.id);
}

/** Shut-down units carried aboard: the Sankofa's engineer brings them back online before the deck scene. */
export function reviveAboard(run: RunState, aboard: readonly MemberId[]): void {
  for (const m of run.party) {
    if (m.kind !== 'android' || m.status !== 'shutdown' || !aboard.includes(m.id)) continue;
    m.status = 'active';
    m.battery = Math.max(m.battery, 25);
  }
  run.carried = [];
}

/** June was with the party at the Port but didn't make it aboard. */
function juneStayedAtPort(run: RunState): boolean {
  return run.stats.lostLog.some((l) => l.member === 'june' && l.where === 'the Port');
}

/** Epilogue lines (§16.2): one per android ("made it" or "lost"), then June's if the party ever met her. */
export function epilogueLines(run: RunState): string[] {
  const lines: string[] = [];
  for (const e of EPILOGUE) {
    const m = run.party.find((p) => p.id === e.member);
    const madeIt = !!m && m.kind === 'android' && m.status !== 'lost';
    lines.push(madeIt ? e.madeIt : e.lost);
  }
  const june = juneEpilogue(run);
  if (june) lines.push(june);
  return lines;
}

function juneEpilogue(run: RunState): string | null {
  switch (run.stats.juneFate) {
    case 'sailed':
      return JUNE_EPILOGUE.sailed;
    case 'arrested':
      return JUNE_EPILOGUE.arrested;
    case 'went-home':
      return JUNE_EPILOGUE.wentHome;
    case 'left':
    case 'with-party':
      return juneStayedAtPort(run) ? JUNE_EPILOGUE.quay : JUNE_EPILOGUE.left;
    default:
      return null;
  }
}

const JUNE_FATE_TEXT: Record<RunStats['juneFate'], string> = {
  'never-met': 'Never met',
  'with-party': 'With the party',
  arrested: 'Arrested',
  left: 'Left the party',
  'went-home': 'Went home',
  sailed: 'Sailed',
};

/** "42 min", "1 h 5 min". */
export function formatPlayTime(ms: number): string {
  const minutes = Math.max(0, Math.round(ms / 60000));
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h} h ${m} min` : `${m} min`;
}

/** The stats screen (§16.2): label and value per row. */
export function statRows(run: RunState): [string, string][] {
  const s = run.stats;
  const june =
    s.juneFate === 'left' && juneStayedAtPort(run) ? 'Stayed at the Port' : JUNE_FATE_TEXT[s.juneFate];
  return [
    ['Days', `${run.day}`],
    ['Stops', `${s.stops}`],
    ['Cells gathered', `${Math.round(s.cellsGathered)}`],
    ['Times exposed', `${s.timesExposed}`],
    ['Units lost', `${s.unitsLost}`],
    ["June's fate", june],
    ['Run time', formatPlayTime(s.playTimeMs)],
  ];
}
