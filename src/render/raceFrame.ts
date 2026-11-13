import type { RaceDay } from '../data/raceDaySchema';
import type { RaceResult } from '../sim/result';
import { callSchedule, announcerAt, type ScheduledCall } from './announcer';
import { callAt, finishLine, formatClock, ordersShort, positionLine } from './format';
import { messageAt, messageSchedule, messageTriggers, type Shown } from './messages';
import { minimapDot, minimapGeometry, minimapWire, type MinimapGeometry } from './minimap';
import { stripAt, stripOrders } from './strip';
import { makeTimeline, phaseAt, playbackAt, raceTimeAt, type Phase, type Timeline } from './timeline';
import {
  SCREEN_W, cameraX, drawOrder, drawnHorsesAt, edgeMarkers, finishRuns, horsesAt, layerScroll, makeRaceModel, polesOf,
  standTiles, strideFrame, viewConfig, type EdgeMarker, type FinishRun, type PoleKind, type RaceModel,
} from './view';

// Everything the race scene draws at one playback moment, worked out from the result,
// your horse and the time only. The scene turns this into sprites and text, nothing more.

export interface ArtFacts {
  gallopFrames: number;
  noseX: number;
  standTileWidth: number;
  poleWidth: number;
  wirePoleWidth: number;
}

export interface RaceSetup {
  result: RaceResult;
  rd: RaceDay;
  raceNumber: number;
  model: RaceModel;
  timeline: Timeline;
  schedule: ScheduledCall[];
  strips: string[][];
  poles: { x: number; kind: PoleKind }[];
  minimap: MinimapGeometry;
  /** Each horse's crossing speed and lane, for the gallop out (RV2b). */
  runs: FinishRun[];
  art: ArtFacts;
}

export function makeRaceSetup(result: RaceResult, rd: RaceDay, raceNumber: number, art: ArtFacts): RaceSetup {
  const model = makeRaceModel(result, viewConfig(rd));
  return {
    result,
    rd,
    raceNumber,
    model,
    timeline: makeTimeline(rd, result.finish[0].time),
    schedule: callSchedule(result, rd, raceNumber),
    strips: stripOrders(result, rd.hud.stripHysteresisLengths.value),
    poles: polesOf(model),
    minimap: minimapGeometry(result.inputs.track),
    runs: finishRuns(result),
    art,
  };
}

export interface PlayerView { id: string; post: number; name: string; orders: string; messages: Shown[] }

/** Your horse's part of the view. Rebuilt when the pick changes at the gate. */
export function playerView(setup: RaceSetup, post: number): PlayerView {
  const horses = setup.result.inputs.card.horses;
  const h = horses.find((x) => x.post === post) ?? [...horses].sort((a, b) => a.post - b.post)[0];
  const { rd, timeline } = setup;
  const triggers = messageTriggers(setup.result, rd, h.id, timeline.speed);
  return {
    id: h.id,
    post: h.post,
    name: h.name,
    orders: ordersShort(h.instructions, rd.copy.orders),
    messages: messageSchedule(triggers, rd.hud.messageSeconds.value, rd.hud.messageMaxWaitSeconds.value),
  };
}

export interface HorseSprite {
  id: string;
  post: number;
  /** Screen x and y of the 32x24 frame's top-left. Past its own finish a horse gallops out (RV2b). */
  x: number;
  y: number;
  stand: boolean;
  frame: number;
  yours: boolean;
}

export interface RaceFrame {
  phase: Phase;
  raceTime: number;
  cam: number;
  farScroll: number;
  midScroll: number;
  standXs: number[];
  poles: { x: number; kind: PoleKind }[];
  /** Screen x of the start line; the scene places the gate by its slot's startX. */
  gate: { startX: number; open: boolean };
  /** Inner lanes first, so later ones draw on top. */
  horses: HorseSprite[];
  arrow: { x: number; y: number } | null;
  /** x is the marker's left column; the scene centers its rows on laneY. */
  edges: (EdgeMarker & { x: number })[];
  call: string;
  strip: { post: number; yours: boolean }[];
  dots: { post: number; x: number; y: number; yours: boolean }[];
  wireTick: { x: number; y: number; h: number };
  name: string;
  position: string;
  orders: string;
  clock: string;
  message: string;
}

const POLE_KIND_WIDTH = (art: ArtFacts, kind: PoleKind) => (kind === 'wire' ? art.wirePoleWidth : art.poleWidth);

export function raceFrame(setup: RaceSetup, me: PlayerView, p: number): RaceFrame {
  const { model, timeline, rd, result, art } = setup;
  const cfg = model.cfg;
  const phase = phaseAt(timeline, p);
  const t = raceTimeAt(timeline, p);
  const cam = cameraX(model, me.id, t);
  const horses = horsesAt(result, cfg, t);
  const drawn = drawnHorsesAt(model, setup.runs, t);
  const stand = phase === 'gate';

  const sprites: HorseSprite[] = drawOrder(drawn).map((h) => ({
    id: h.id,
    post: h.post,
    x: h.x - art.noseX - cam,
    y: h.hoofY - cfg.frameTopFromHoof,
    stand,
    frame: stand ? 0 : strideFrame(h.distance, h.post, cfg, art.gallopFrames),
    yours: h.id === me.id,
  }));
  const mine = sprites.find((s) => s.yours);

  const poles = setup.poles
    .map((pl) => ({ x: pl.x - Math.floor(POLE_KIND_WIDTH(art, pl.kind) / 2) - cam, kind: pl.kind }))
    .filter((pl) => pl.x + POLE_KIND_WIDTH(art, pl.kind) > 0 && pl.x < SCREEN_W);

  const winnerIn = t >= result.finish[0].time;
  // Markers point at a race still being run: the leader's until the winner is in, yours until you are.
  const myFinish = result.finish.find((f) => f.id === me.id)?.time ?? Infinity;
  const edges = edgeMarkers(drawn, me.id, cam, art.noseX)
    .filter((e) => (e.side === 'right' ? !winnerIn : t < myFinish))
    .map((e) => ({ ...e, x: e.side === 'right' ? SCREEN_W - 8 : 0 }));
  const message = phase === 'gate'
    ? rd.copy.pickPrompt
    : messageAt(me.messages, p - timeline.doorsAt) ?? (phase === 'done' ? rd.copy.nextRace : '');

  const laneMax = result.inputs.tuning.laneMax.value;
  const D = model.distance;
  const dots = horses
    .map((h) => ({ post: h.post, ...minimapDot(setup.minimap, h.distance, D, h.lane, laneMax, h.id === me.id), yours: h.id === me.id }))
    .sort((a, b) => Number(a.yours) - Number(b.yours) || a.post - b.post);

  const postOf = new Map(result.replay.horses.map((h) => [h.id, h.post]));
  const strip = stripAt(setup.strips, result.replay.step, t).map((id) => ({ post: postOf.get(id) ?? 0, yours: id === me.id }));

  return {
    phase,
    raceTime: t,
    cam,
    farScroll: layerScroll(cam, cfg.farParallaxDivisor),
    midScroll: layerScroll(cam, cfg.midParallaxDivisor),
    standXs: standTiles(model, cam, art.standTileWidth),
    poles,
    gate: { startX: -cam, open: phase !== 'gate' },
    horses: sprites,
    arrow: mine ? { x: mine.x + cfg.playerArrowDx, y: mine.y + cfg.playerArrowDy } : null,
    edges,
    call: announcerAt(setup.schedule, p, (rt) => playbackAt(timeline, rt), rd.hud.typeCharsPerSecond.value),
    strip,
    dots,
    wireTick: minimapWire(setup.minimap),
    name: me.name,
    position: finishLine(result.finish, me.id, t, rd.copy)
      ?? positionLine(callAt(result.calls, t), me.id, me.post, result.inputs.tuning.marginLabelBounds.value, rd.copy),
    orders: me.orders,
    clock: winnerIn ? formatClock(result.finish[0].time, true) : formatClock(t, false),
    message,
  };
}
