/**
 * The stop HUD (spec §13.3) and world overlays (spec §8.4): player panels (P1 top-left, P2 top-right) with a
 * head portrait, segmented Hull/Skin/Battery bars, an Integrity pip row, the suspicion eye, and the ability
 * cooldown ring; AI members as small rows bottom-left; patrol pips and the ALERT banner top-center; prompts
 * bottom-center; observer icons, the eye over members, player chevrons, speech, pickups, the Blend radial,
 * the hack sequence, and the breathing ring.
 */
import { MEMBERS } from '../content/characters';
import { TUNING } from '../content/tuning';
import type { Slot } from '../core/types';
import type { Glyph, GlyphDevice } from '../input/glyphs';
import type { CameraRig } from '../render/camera';
import { C } from '../render/palettes';
import { abilityReady, blendsFor, findInteraction } from '../sim/actions';
import { BLEND_LABEL } from '../sim/blend';
import { ringPhase, timeToBeat } from '../sim/breathing';
import type { StopSim } from '../sim/stop';
import type { MemberActor } from '../sim/types';
import type { StopView } from '../render/stopview';
import type { UiSurface } from './surface';

export interface FloatText {
  text: string;
  x: number;
  y: number;
  z: number;
  t: number;
  color: number;
}

export interface Bubble {
  text: string;
  npc: boolean;
  idx: number;
  t: number;
}

const _p = { x: 0, y: 0 };
const HACK_GLYPHS: Glyph[] = ['A', 'B', 'X', 'Y'];

export class StopHud {
  floats: FloatText[] = [];
  bubbles: Bubble[] = [];
  alertBannerT = 0;
  popT = new Map<number, number>();
  time = 0;

  constructor(
    private readonly sim: StopSim,
    private readonly view: StopView,
    private readonly rig: CameraRig,
    private readonly glyphs: (slot: Slot) => GlyphDevice,
  ) {}

  addFloat(text: string, x: number, y: number, color: number = C.fog2): void {
    this.floats.push({ text, x, y: 1.9, z: y, t: 0, color });
    void x;
  }

  update(dt: number): void {
    this.time += dt;
    for (const f of this.floats) f.t += dt;
    this.floats = this.floats.filter((f) => f.t < 1.6);
    for (const b of this.bubbles) b.t += dt;
    this.bubbles = this.bubbles.filter((b) => b.t < 2.6);
    if (this.alertBannerT > 0) this.alertBannerT -= dt;
    for (const [k, v] of this.popT) {
      if (v <= 0) this.popT.delete(k);
      else this.popT.set(k, v - dt);
    }
  }

  private toLow(x: number, y: number, z: number): { x: number; y: number } {
    return this.rig.worldToLow(x, y, z, _p);
  }

  draw(ui: UiSurface): void {
    const s = ui.scale;
    this.drawWorldOverlays(ui, s);
    this.drawPanels(ui);
    this.drawTopCenter(ui);
    this.drawPrompts(ui);
  }

  // -----------------------------------------------------------------------------------------------
  // World overlays
  // -----------------------------------------------------------------------------------------------

  private drawWorldOverlays(ui: UiSurface, scale: number): void {
    const sim = this.sim;
    const k = 1 / scale;
    // Observer icons: shape differs by state, not just color.
    for (const n of sim.npcs) {
      if (!sim.isActiveNpc(n) || n.role === 'keeper' || n.role === 'crew' || n.role === 'mensah') continue;
      const head = this.view.headOf(false, n.idx);
      if (!head) continue;
      const p = this.toLow(head.x, head.y, head.z);
      const x = Math.round(p.x * k);
      const y = Math.round(p.y * k);
      let maxA = 0;
      for (const m of sim.members) maxA = Math.max(maxA, n.obs.awareness[m.id] ?? 0);
      switch (n.obs.state) {
        case 'curious':
          ui.icon('question', x - 2, y - 9, C.fog2);
          break;
        case 'suspicious': {
          // Red "?" that fills as awareness rises.
          ui.icon('question', x - 2, y - 9, C.slate1);
          const fill = Math.round(((maxA - 60) / 40) * 7);
          ui.ctx.save();
          ui.ctx.beginPath();
          ui.ctx.rect(x - 2, y - 2 - fill, 5, fill);
          ui.ctx.clip();
          ui.icon('question', x - 2, y - 9, C.red1);
          ui.ctx.restore();
          break;
        }
        case 'alarmed': {
          // Red "!" with a 4-frame pop.
          const pop = this.popT.get(n.idx) ?? 0;
          const dy = pop > 0 ? -2 : 0;
          ui.icon('bang', x - 2, y - 9 + dy, C.red1);
          break;
        }
        case 'helping':
          ui.icon('diamond', x - 2, y - 7, C.amber2);
          break;
        case 'searching':
          ui.icon('dots', x - 4, y - 5, C.slate1);
          break;
        default:
          break;
      }
    }
    // Cameras' alarm and drones don't get icons; their cones do the talking.
    for (const m of sim.members) {
      if (!sim.present(m)) continue;
      const head = this.view.headOf(true, m.idx);
      if (!head) continue;
      const p = this.toLow(head.x, head.y, head.z);
      const x = Math.round(p.x * k);
      const y = Math.round(p.y * k);
      // Player chevrons: fog white P1, amber P2, dim for AI.
      if (m.controller !== null) {
        const col = m.controller === 0 ? C.fog2 : C.amber2;
        ui.icon('chevron', x - 3, y - 6, col);
        ui.text(String(m.controller + 1), x - 1, y - 14, col, { font: 'num' });
      } else if (m.mode !== 'shutdown' && m.mode !== 'carried') {
        ui.icon('chevron', x - 3, y - 6, C.slate1);
      }
      // The eye glyph once Suspicion passes 30: fills red as it rises, pulses near 100.
      if (m.suspicion > TUNING.awareness.curious) this.eye(ui, x - 3, y - 24, m.suspicion);
    }
    // Speech bubbles.
    for (const b of this.bubbles) {
      const head = this.view.headOf(!b.npc, b.idx);
      if (!head) continue;
      const p = this.toLow(head.x, head.y, head.z);
      const lines = ui.wrap(b.text, 120);
      const w = Math.max(...lines.map((l) => ui.measure(l))) + 6;
      const h = lines.length * 10 + 3;
      const bx = Math.round(p.x * k - w / 2);
      const by = Math.round(p.y * k - 34 - h);
      ui.panel(bx, by, w, h, C.night0, C.slate0);
      lines.forEach((l, i) => ui.text(l, bx + 3, by + 2 + i * 10, b.npc ? C.fog1 : C.fog2, { shadow: null }));
    }
    // Pickups: a tiny number that floats up and fades.
    for (const f of this.floats) {
      const p = this.toLow(f.x, f.y + f.t * 0.8, f.z);
      if (f.t > 1.2 && Math.floor(f.t * 20) % 2 === 0) continue;
      ui.text(f.text, Math.round(p.x * k), Math.round(p.y * k), f.color, { align: 'center' });
    }
    // Pinged container marker.
    for (const c of sim.containers) {
      if (!c.pinged || c.searched) continue;
      const p = this.toLow(c.cx, 1.6, c.cy);
      ui.icon(
        'diamond',
        Math.round(p.x * k) - 2,
        Math.round(p.y * k) - 4 + Math.round(Math.sin(this.time * 4)),
        C.fog2,
      );
    }
    // Sympathizer gifts: a small amber glint.
    for (const c of sim.containers) {
      if (!c.glint || c.searched) continue;
      const p = this.toLow(c.cx, 0.9, c.cy);
      if (Math.floor(this.time * 3) % 2 === 0) ui.pixel(Math.round(p.x * k), Math.round(p.y * k), C.amber2);
    }
  }

  eye(ui: UiSurface, x: number, y: number, s: number): void {
    const level = Math.max(0, Math.min(1, (s - 30) / 70));
    const pulse = s >= 90 && Math.floor(this.time * 6) % 2 === 0;
    ui.icon('eye', x, y, pulse ? C.red2 : C.fog2);
    const fill = Math.ceil(level * 5);
    if (fill > 0) {
      ui.ctx.save();
      ui.ctx.beginPath();
      ui.ctx.rect(x, y + 5 - fill, 7, fill);
      ui.ctx.clip();
      ui.icon('eyeFill', x, y, C.red1);
      ui.ctx.restore();
      ui.icon('eye', x, y, pulse ? C.red2 : C.fog2);
    }
  }

  // -----------------------------------------------------------------------------------------------
  // Panels
  // -----------------------------------------------------------------------------------------------

  private drawPanels(ui: UiSurface): void {
    const sim = this.sim;
    for (const slot of [0, 1] as Slot[]) {
      const m = sim.controlled(slot);
      const right = slot === 1;
      const x = right ? ui.width - 110 : 4;
      if (!m) {
        if (sim.waiting[slot]) {
          ui.panel(x, 4, 106, 14, C.night0, C.slate0);
          ui.text('Waiting for a free party member', x + 3, 7, C.fog1, { shadow: null });
        }
        continue;
      }
      this.panel(ui, m, x, 4, slot);
    }
    // AI rows, bottom-left.
    let y = ui.height - 14;
    for (const m of [...sim.members].reverse()) {
      if (m.controller !== null || m.mode === 'gone') continue;
      this.aiRow(ui, m, 4, y);
      y -= 11;
    }
  }

  private face(ui: UiSurface, m: MemberActor, x: number, y: number, size: 'big' | 'small'): void {
    // A tiny head portrait in the member's colors (hair, skin; slate face plate when exposed).
    const s = size === 'big' ? 1 : 0;
    const look = MEMBERS[m.id];
    void look;
    const skin =
      m.id === 'wren' ? C.skin3 : m.id === 'brick' ? C.skin1 : m.id === 'vesper' ? C.skin4 : C.skin0;
    const hair =
      m.id === 'wren' ? C.night1 : m.id === 'brick' ? C.amber0 : m.id === 'vesper' ? C.slate0 : C.night0;
    const exposed = m.state.kind === 'android' && m.state.skin <= 5;
    const w = 7 + s * 2;
    ui.rect(x, y, w + 2, w + 2, C.night1);
    ui.rect(x + 1, y + 1, w, w, exposed ? C.slate0 : skin);
    ui.rect(x + 1, y + 1, w, 2 + s, hair);
    if (exposed) ui.rect(x + 2, y + 4 + s, w - 2, 1, C.red1);
    else {
      ui.pixel(x + 3, y + 5 + s, C.night0);
      ui.pixel(x + w - 2, y + 5 + s, C.night0);
    }
  }

  private panel(ui: UiSurface, m: MemberActor, x: number, y: number, slot: Slot): void {
    const sim = this.sim;
    const w = 106;
    ui.panel(x, y, w, 36, C.night0, slot === 0 ? C.slate1 : C.amber0);
    this.face(ui, m, x + 3, y + 3, 'big');
    ui.text(MEMBERS[m.id].name, x + 16, y + 2, slot === 0 ? C.fog2 : C.amber2, { shadow: null });
    const s = m.state;
    if (s.kind === 'android') {
      const bars: [string, number, number][] = [
        ['H', s.hull, C.fog1],
        ['S', s.skin, C.skin3],
        ['B', s.battery, s.battery < TUNING.charging.lowBattery ? C.red1 : C.amber2],
      ];
      bars.forEach(([lbl, v, col], i) => {
        const by = y + 13 + i * 6;
        ui.text(lbl, x + 16, by - 1, C.slate1, { font: 'num', shadow: null });
        ui.segBar(x + 21, by, 10, 4, 4, v, 100, col);
      });
      // Integrity pips.
      const pips = Math.ceil(s.integrity / 20);
      for (let i = 0; i < 5; i++)
        ui.rect(x + 3 + i * 2, y + 31, 1, 2, i < pips ? (s.integrity < 40 ? C.red1 : C.fog1) : C.night3);
    } else {
      ui.text('HP', x + 16, y + 12, C.slate1, { font: 'num', shadow: null });
      ui.segBar(x + 25, y + 13, 10, 4, 4, s.health, 100, C.fog1);
      ui.text('Hunger', x + 16, y + 20, C.slate1, { shadow: null });
      ui.segBar(x + 48, y + 22, 6, 4, 3, s.hunger, 100, C.amber1);
    }
    // The suspicion eye (the one bold element) and the ability ring.
    this.eye(ui, x + w - 26, y + 4, Math.max(31, m.suspicion));
    if (m.suspicion <= TUNING.awareness.curious) {
      ui.ctx.save();
      ui.icon('eye', x + w - 26, y + 4, C.slate0);
      ui.ctx.restore();
    }
    const dev = this.glyphs(slot);
    const ready = abilityReady(sim, m) === null;
    const cd = m.abilityCd;
    const bx = x + w - 14;
    const byy = y + 3;
    ui.button('Y', dev, bx - 2, byy + 12);
    if (!ready && cd > 0) {
      // Cooldown ring: a frame that fills clockwise as the ability recharges.
      const total = this.cooldownTotal(m);
      const k = 1 - Math.min(1, cd / total);
      const segs = 12;
      const filled = Math.floor(k * segs);
      for (let i = 0; i < segs; i++) {
        const a = (i / segs) * Math.PI * 2 - Math.PI / 2;
        ui.pixel(
          bx + 2 + Math.round(Math.cos(a) * 6),
          byy + 16 + Math.round(Math.sin(a) * 6),
          i < filled ? C.fog1 : C.night3,
        );
      }
    }
  }

  private cooldownTotal(m: MemberActor): number {
    const A = TUNING.abilities;
    switch (m.id) {
      case 'wren':
        return A.soothe.cooldown;
      case 'brick':
        return A.heave.cooldown;
      case 'vesper':
        return A.takedown.cooldown;
      default:
        return A.patch.cooldown;
    }
  }

  private aiRow(ui: UiSurface, m: MemberActor, x: number, y: number): void {
    this.face(ui, m, x, y, 'small');
    ui.text(MEMBERS[m.id].name, x + 12, y, m.mode === 'shutdown' ? C.red1 : C.fog0, {});
    const s = m.state;
    if (s.kind === 'android') {
      ui.segBar(x + 46, y + 2, 5, 3, 3, s.hull, 100, C.fog1);
      ui.segBar(
        x + 67,
        y + 2,
        5,
        3,
        3,
        s.battery,
        100,
        s.battery < TUNING.charging.lowBattery ? C.red1 : C.amber2,
      );
    }
    if (m.suspicion > TUNING.awareness.curious) this.eye(ui, x + 90, y, m.suspicion);
    if (m.mode === 'shutdown')
      ui.text(`${Math.max(0, Math.ceil(TUNING.shutdown.reviveWindow - m.downT))}`, x + 90, y + 1, C.red1, {
        font: 'num',
      });
  }

  // -----------------------------------------------------------------------------------------------
  // Top center: patrol pips, ALERT banner, the dawn clock
  // -----------------------------------------------------------------------------------------------

  private drawTopCenter(ui: UiSurface): void {
    const sim = this.sim;
    const cx = Math.floor(ui.width / 2);
    if (sim.port) {
      const mins = Math.floor(sim.port.clock);
      const hh = Math.floor(mins / 60);
      const mm = mins % 60;
      const txt = `${hh}:${mm.toString().padStart(2, '0')} AM`;
      const late = mins >= TUNING.port.hornAtMinutes;
      ui.panel(cx - 26, 3, 52, 13, C.night0, late ? C.red0 : C.slate0);
      ui.text(txt, cx, 6, late ? C.red1 : C.fog2, { align: 'center', shadow: null });
      if (sim.port.gangwayT >= 0) {
        const left = Math.max(0, Math.ceil(TUNING.port.gangwaySeconds - sim.port.gangwayT));
        ui.text(`Gangway ${left}`, cx, 18, C.red1, { align: 'center' });
      }
    } else if (!sim.cfg.noPatrol && sim.patrol.drone1 < Infinity) {
      const pips = sim.patrolPips();
      const total = pips[2].at;
      const w = 64;
      ui.rect(cx - w / 2, 7, w, 1, C.night3);
      const prog = Math.min(1, sim.time / total);
      ui.rect(cx - w / 2, 7, Math.round(w * prog), 1, C.slate1);
      for (const p of pips) {
        const px = Math.round(cx - w / 2 + (p.at / total) * w) - 1;
        ui.icon(p.done ? 'pip' : 'pipEmpty', px, 5, p.done ? C.fog1 : C.slate1);
      }
    }
    if (sim.alert.on) {
      const flash = Math.floor(this.time * 3) % 2 === 0 || sim.alert.searching;
      const label = sim.alert.searching ? 'SEARCHING' : 'ALERT';
      const y = 14;
      ui.panel(cx - 30, y, 60, 13, C.night0, sim.alert.searching ? C.slate1 : C.red0);
      ui.text(label, cx, y + 3, sim.alert.searching ? C.fog1 : flash ? C.red1 : C.red2, {
        align: 'center',
        shadow: null,
      });
    }
    if (sim.exit.departing) {
      const t = Math.ceil(sim.exit.waitT);
      ui.text(`Leaving in ${t}`, cx, 30, C.fog2, { align: 'center' });
    }
  }

  // -----------------------------------------------------------------------------------------------
  // Prompts, radial, hack sequence, breathing ring
  // -----------------------------------------------------------------------------------------------

  private drawPrompts(ui: UiSurface): void {
    const sim = this.sim;
    for (const slot of [0, 1] as Slot[]) {
      const m = sim.controlled(slot);
      if (!m) continue;
      const dev = this.glyphs(slot);
      const solo = sim.control[1] === null && !sim.waiting[1];
      const cx = solo
        ? Math.floor(ui.width / 2)
        : slot === 0
          ? Math.floor(ui.width * 0.27)
          : Math.floor(ui.width * 0.73);
      const y = ui.height - 16;
      if (m.mode === 'hack' && m.hack) {
        this.hackSeq(ui, m, dev, cx, y - 14);
        continue;
      }
      if (m.mode === 'scanned' && m.scan) {
        this.breathRing(ui, m, dev, cx, y - 40);
        continue;
      }
      if (m.radial) {
        this.radial(ui, m, cx, Math.floor(ui.height / 2));
        continue;
      }
      const prompts: [Glyph, string][] = [];
      const it = findInteraction(sim, m);
      if (it) prompts.push(['A', it.disabled ? `${it.verb}` : it.verb]);
      if (m.mode === 'free' || m.mode === 'blend') {
        const best = blendsFor(sim, m)[0];
        if (
          best &&
          m.mode === 'free' &&
          (m.suspicion > 15 || m.stillT > 2.5 || best === 'order' || best === 'sit')
        )
          prompts.push(['X', BLEND_LABEL[best]]);
        const partner = sim.controlled(slot === 0 ? 1 : 0);
        if (
          partner &&
          Math.hypot(partner.x - m.x, partner.y - m.y) <= TUNING.blend.chatDistance &&
          m.mode === 'free'
        )
          prompts.push(['RB', 'Chat']);
      }
      if (m.mode === 'blend' && m.blend && (m.blend === 'sit' || m.blend === 'pump' || m.blend === 'shelter'))
        prompts.push(['LS', 'Get up']);
      if (m.plug) prompts.push(['LS', 'Unplug']);
      if (m.mode === 'carry') prompts.push(['A', 'Put down']);
      let total = 0;
      for (const [g, v] of prompts) total += ui.measureButton(g, dev) + 4 + ui.measure(v) + 10;
      let px = cx - total / 2;
      for (const [g, v] of prompts)
        px += ui.prompt(g, dev, v, px, y, it?.disabled && g === 'A' ? C.slate1 : C.fog2) + 10;
      // Held interactions show progress.
      if (m.channel || sim.exit.holdT > 0) {
        const ch = m.channel;
        const k = ch ? ch.t / ch.need : sim.exit.holdT / TUNING.exit.holdSeconds;
        if (k > 0) {
          ui.rect(cx - 20, y - 5, 40, 2, C.night3);
          ui.rect(cx - 20, y - 5, Math.round(40 * Math.min(1, k)), 2, C.fog2);
        }
      }
    }
  }

  private radial(ui: UiSurface, m: MemberActor, cx: number, cy: number): void {
    const list = blendsFor(this.sim, m);
    const r = 46;
    ui.panel(cx - 3, cy - 3, 7, 7, C.night0, C.slate1);
    list.forEach((b, i) => {
      const a = (i / list.length) * Math.PI * 2 - Math.PI / 2;
      const x = Math.round(cx + Math.cos(a) * r);
      const y = Math.round(cy + Math.sin(a) * r * 0.75);
      const sel = i === m.radialSel;
      const label = BLEND_LABEL[b];
      const w = ui.measure(label) + 6;
      ui.panel(x - w / 2, y - 6, w, 13, sel ? C.slate0 : C.night0, sel ? C.amber1 : C.slate0);
      ui.text(label, x, y - 3, sel ? C.amber2 : C.fog1, { align: 'center', shadow: null });
    });
  }

  private hackSeq(ui: UiSurface, m: MemberActor, dev: GlyphDevice, cx: number, y: number): void {
    const h = m.hack!;
    const left = Math.max(0, TUNING.charging.hackSeconds - h.t);
    ui.panel(cx - 40, y - 4, 80, 26, C.night0, C.cyan0);
    h.seq.forEach((b, i) => {
      const x = cx - 32 + i * 17;
      if (i < h.pos) ui.rect(x, y + 1, 9, 9, C.cyan0);
      else ui.button(HACK_GLYPHS[b], dev, x, y + 1);
    });
    ui.rect(cx - 36, y + 15, Math.round(72 * (left / TUNING.charging.hackSeconds)), 2, C.cyan1);
  }

  private breathRing(ui: UiSurface, m: MemberActor, dev: GlyphDevice, cx: number, cy: number): void {
    const s = m.scan!;
    const R = 14;
    const ring = ringPhase(s);
    // Marker circle and the expanding pulse ring.
    for (let i = 0; i < 32; i++) {
      const a = (i / 32) * Math.PI * 2;
      ui.pixel(Math.round(cx + Math.cos(a) * R), Math.round(cy + Math.sin(a) * R), C.slate1);
    }
    const rr = Math.max(1, ring * R);
    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * Math.PI * 2;
      ui.pixel(Math.round(cx + Math.cos(a) * rr), Math.round(cy + Math.sin(a) * rr), C.cyan1);
    }
    // The tiny notch at the center of the window.
    ui.pixel(cx, cy - R - 2, C.cyan2);
    ui.prompt('A', dev, 'Breathe', cx, cy + R + 4, C.fog2, 'center');
    const meter = Math.min(1, s.meter / TUNING.breathing.routineFailAt);
    ui.rect(cx - 20, cy + R + 16, 40, 2, C.night3);
    ui.rect(cx - 20, cy + R + 16, Math.round(40 * meter), 2, C.red1);
    if (s.last !== 'none' && s.t - s.lastT < 0.5) {
      const label =
        s.last === 'miss'
          ? 'Missed'
          : s.last === 'regular'
            ? 'Too regular'
            : s.last === 'early'
              ? 'Too early'
              : '';
      if (label) ui.text(label, cx, cy - R - 12, C.red2, { align: 'center' });
    }
    void timeToBeat;
  }
}
