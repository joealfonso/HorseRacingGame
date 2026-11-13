import type { RaceDay } from '../data/raceDaySchema';
import type { RaceResult } from '../sim/result';
import { ambientState, midZones, turnArt, zoneTiles, type AmbientId, type AmbientState, type MidZone, type TurnArt } from './ambient';
import { callForBar, callSchedule, announcerAt, winnerCallAfterPhoto, type ScheduledCall } from './announcer';
import { callAt, finishLine, formatClock, ordersShort, positionLine } from './format';
import { messageAt, messageSchedule, messageTriggers, triggersOnWall, type Shown, type Trigger } from './messages';
import { minimapDot, minimapGeometry, minimapWire, type MinimapGeometry } from './minimap';
import { photoFrame, photoHorses, photoNamesWinner, type PhotoFrame } from './photo';
import { stripAt, stripOrders } from './strip';
import { clockAt, isPlain, makeTimeline, phaseOf, playbackAt, raceAtWall, wallAtRace, wasSkipped, type Clock, type Phase, type Timeline } from './timeline';
import {
  SCREEN_W, cameraX, drawOrder, drawnHorsesAt, edgeMarkers, finishRuns, horsesAt, layerScroll, makeRaceModel, polesOf,
  standTiles, strideFrame, viewConfig, hoofY, type EdgeMarker, type FinishRun, type PoleKind, type RaceModel,
} from './view';
import { beatPose } from './winnerBeat';

// Everything the race scene draws at one playback moment, worked out from the result,
// your horse and the time only. The scene turns this into sprites and text, nothing more.

export interface ArtFacts {
  gallopFrames: number;
  noseX: number;
  standTileWidth: number;
  poleWidth: number;
  wirePoleWidth: number;
  /** Step 2 slots. Left out, the frame has no walk frames (the stride holds frame 0) and no crowd, infield or flag. */
  walkFrames?: number;
  crowdTileWidth?: number;
  infieldTileWidth?: number;
  /** Width of the infield's repeating pole-free slice, which fills a turn around the one full tile. */
  infieldFillWidth?: number;
  /** The flag's top-left inside its infield tile, and its width. */
  flagAt?: readonly [number, number];
  flagWidth?: number;
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
  /** Mid-layer zones: stretches carry the grandstand and crowd, turns the infield and flag. */
  zones: MidZone[];
  /** Each turn's infield art after the stretches clip it (CH1), when the art facts allow. */
  turns: TurnArt[];
  /** Each horse's crossing speed and lane, for the gallop out (RV2b). */
  runs: FinishRun[];
  art: ArtFacts;
}

export function makeRaceSetup(result: RaceResult, rd: RaceDay, raceNumber: number, art: ArtFacts): RaceSetup {
  const model = makeRaceModel(result, viewConfig(rd));
  const zones = midZones(model);
  return {
    result,
    rd,
    raceNumber,
    model,
    timeline: makeTimeline(rd, result.finish[0].time, result.photoFinish),
    schedule: callSchedule(result, rd, raceNumber),
    strips: stripOrders(result, rd.hud.stripHysteresisLengths.value),
    poles: polesOf(model),
    minimap: minimapGeometry(result.inputs.track),
    zones,
    turns: art.infieldTileWidth
      ? zones.filter((z) => z.kind === 'turn').map((z) => turnArt(z, zones.filter((q) => q.kind === 'stretch'), art.standTileWidth, art.infieldFillWidth ?? art.infieldTileWidth!, art.infieldTileWidth!))
      : [],
    runs: finishRuns(result),
    art,
  };
}

export interface PlayerView { id: string; post: number; name: string; orders: string; messages: Shown[]; triggers: Trigger[] }

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
    triggers,
  };
}

export interface HorseSprite {
  id: string;
  post: number;
  /** Screen x and y of the 32x24 frame's top-left. Past its own finish a horse gallops out (RV2b). */
  x: number;
  y: number;
  stand: boolean;
  /** Which strip the frame is in: stand at the gate, gallop, walk in the winner beat. */
  pose: 'stand' | 'gallop' | 'walk';
  /** The jockey layers show the winner frames (the fist) instead of the pose's own. */
  fist: boolean;
  frame: number;
  yours: boolean;
}

export interface RaceFrame {
  phase: Phase;
  raceTime: number;
  /** The race camera of spec 3.5 (RV3 to RV6). */
  cam: number;
  /** The camera the world is drawn with: the race camera, or the winner beat's. */
  drawCam: number;
  /** Space is holding 4x: the tag shows and the call is cut to 27 characters. */
  fastTag: string | null;
  ambient: AmbientState;
  /** Flipped on odd mid-layer tiles, like the rails, so the strip repeats every two tiles. */
  crowdTiles: { x: number; frame: number; flip: boolean }[];
  /**
   * Pole-free fill slices (full false) and the one full tile per turn (full true), which
   * carries the flag. Draw columns srcX to srcX + width - 1 of the slice (or tile) with the
   * first of them at screen x: a slice next to the grandstand is cropped so it ends, or
   * starts, exactly at the stand's edge. Whole pieces have srcX 0 and their full width.
   */
  infieldTiles: { x: number; full: boolean; srcX: number; width: number }[];
  flags: { x: number; y: number; frame: number }[];
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
  /** The photo finish (spec 4.4), only in the photo beat of a race the result flags. */
  photo: PhotoFrame | null;
  /**
   * The HUD's contents (call, 4x tag, strip, mini map, your lines, clock, message) are drawn.
   * Off in the photo, whose panel and captions take their place; the values stay as they are.
   */
  hudVisible: boolean;
  name: string;
  position: string;
  orders: string;
  clock: string;
  message: string;
}

const POLE_KIND_WIDTH = (art: ArtFacts, kind: PoleKind) => (kind === 'wire' ? art.wirePoleWidth : art.poleWidth);

/** The world px of the mid layer row the flag sits on: the infield tile's top. */
const MID_TOP = 56;

/**
 * The frame at a moment. `at` is a playback second of a race played at normal speed (the
 * P0 form), or the scene's clock with 4x, skips and pause folded in.
 */
export function raceFrame(setup: RaceSetup, me: PlayerView, at: number | Clock): RaceFrame {
  const { model, timeline, rd, result, art } = setup;
  const cfg = model.cfg;
  const c = typeof at === 'number' ? clockAt(timeline, at) : at;
  const p = c.wall;
  const phase = phaseOf(c);
  // The race view behind the photo is frozen as it was when the photo began (art review
  // 2026-11-13). Race time runs on in the clock; the view's race time `t` stands still for
  // the photo and then runs on from where it stopped, so the winner beat starts from the
  // frozen state. With no photo, t is the clock's race time.
  const photoBegun = c.holdEndWall !== null && c.photoEndWall !== c.holdEndWall;
  const frozenT = photoBegun ? raceAtWall(c, c.holdEndWall!) : c.race;
  const span = !photoBegun ? 0 : c.photoEndWall === null ? c.race - frozenT : raceAtWall(c, c.photoEndWall) - frozenT;
  const t = c.race - span;
  const plain = !photoBegun && isPlain(c, timeline);
  // The wall second view time reached race time rt: past the freeze, that is when the clock reached rt + span.
  const toWall = plain ? (rt: number) => playbackAt(timeline, rt)
    : (rt: number) => (rt <= frozenT ? wallAtRace(c, rt) : c.photoEndWall === null ? Infinity : wallAtRace(c, rt + span));
  // Wall time with the photo taken out: it stands still for the photo and runs on after
  // it. The message line and the ambient loops pause on it, so nothing is used up unseen.
  const holdEnd = c.holdEndWall;
  const photoWall = (w: number) => (!photoBegun || holdEnd === null || w <= holdEnd || !Number.isFinite(w) ? w
    : c.photoEndWall === null || w <= c.photoEndWall ? holdEnd : w - (c.photoEndWall - holdEnd));
  const cam = cameraX(model, me.id, t);
  const horses = horsesAt(result, cfg, t);
  const drawn = drawnHorsesAt(model, setup.runs, t);
  const stand = phase === 'gate';
  const winner = result.finish[0];
  const winnerIn = t >= winner.time;

  // The winner beat, from the end of the wire hold (and the photo, when there is one): the
  // winner alone, the camera on it.
  const beat = c.photoEndWall !== null ? (() => {
    const k = result.replay.horses.findIndex((h) => h.id === winner.id);
    const run = setup.runs[k];
    // The view's race time at the photo's end: the frozen moment when there was a photo.
    const raceAtStart = photoBegun ? frozenT : raceAtWall(c, c.photoEndWall!);
    const start = { distance: model.distance + run.speed * (raceAtStart - run.finishTime), speed: run.speed, lane: run.lane };
    const pose = beatPose(rd, cfg, start, winner.post, c.wall - c.photoEndWall!, timeline.speed, art.noseX, art.gallopFrames, art.walkFrames ?? 1);
    return { pose, post: winner.post, id: winner.id, lane: run.lane };
  })() : null;
  const drawCam = beat ? beat.pose.cam : cam;

  const sprites: HorseSprite[] = beat
    ? [{
      id: beat.id, post: beat.post, x: rd.winnerBeat.frameLeft.value, y: hoofY(beat.lane, cfg) - cfg.frameTopFromHoof,
      stand: false, pose: beat.pose.walking ? 'walk' : 'gallop', fist: beat.pose.walking, frame: beat.pose.frame, yours: beat.id === me.id,
    }]
    : drawOrder(drawn).map((h) => ({
      id: h.id,
      post: h.post,
      x: h.x - art.noseX - cam,
      y: h.hoofY - cfg.frameTopFromHoof,
      stand,
      pose: stand ? 'stand' as const : 'gallop' as const,
      fist: false,
      frame: stand ? 0 : strideFrame(h.distance, h.post, cfg, art.gallopFrames),
      yours: h.id === me.id,
    }));
  const mine = sprites.find((s) => s.yours);

  const poles = setup.poles
    .map((pl) => ({ x: pl.x - Math.floor(POLE_KIND_WIDTH(art, pl.kind) / 2) - drawCam, kind: pl.kind }))
    .filter((pl) => pl.x + POLE_KIND_WIDTH(art, pl.kind) > 0 && pl.x < SCREEN_W);

  // Markers point at a race still being run: the leader's until the winner is in, yours until you are.
  const myFinish = result.finish.find((f) => f.id === me.id)?.time ?? Infinity;
  const edges = beat ? [] : edgeMarkers(drawn, me.id, cam, art.noseX)
    .filter((e) => (e.side === 'right' ? !winnerIn : t < myFinish))
    .map((e) => ({ ...e, x: e.side === 'right' ? SCREEN_W - 8 : 0 }));

  let shownMessage: string | null;
  if (plain) shownMessage = messageAt(me.messages, p - timeline.doorsAt);
  else {
    // FN1: a message from a skipped stretch is dropped, not shown late, and so is the
    // "Back in stride" that follows it (it carries its event's race time).
    // Placed and shown on the photo-excluded wall time: a message on screen or queued when
    // the photo begins waits behind it, and the 3 s drop rule counts in the same time.
    const onWall = triggersOnWall(me.triggers.filter((tr) => tr.race === undefined || !wasSkipped(c, tr.race)), (rt) => photoWall(toWall(rt)));
    shownMessage = messageAt(messageSchedule(onWall, rd.hud.messageSeconds.value, rd.hud.messageMaxWaitSeconds.value), photoWall(p));
  }
  const message = phase === 'gate' ? rd.copy.pickPrompt : shownMessage ?? (phase === 'done' ? rd.copy.nextRace : '');

  const laneMax = result.inputs.tuning.laneMax.value;
  const D = model.distance;
  const dots = horses
    .map((h) => ({ post: h.post, ...minimapDot(setup.minimap, h.distance, D, h.lane, laneMax, h.id === me.id), yours: h.id === me.id }))
    .sort((a, b) => Number(a.yours) - Number(b.yours) || a.post - b.post);

  const postOf = new Map(result.replay.horses.map((h) => [h.id, h.post]));
  const strip = stripAt(setup.strips, result.replay.step, t).map((id) => ({ post: postOf.get(id) ?? 0, yours: id === me.id }));

  // Ambient loops on the mid layer, in wall time, inside the cap (CH1).
  const midScroll = layerScroll(drawCam, cfg.midParallaxDivisor);
  const eighth = result.calls.find((x) => x.furlongsToGo === 1);
  const eighthWall = eighth && t >= eighth.time ? toWall(eighth.time) : Infinity;
  const zones = setup.zones;
  const tilesOf = (kind: MidZone['kind'], w: number | undefined) => (w ? zones.filter((z) => z.kind === kind).flatMap((z) => zoneTiles(z, midScroll, w)) : []);
  const crowdRaw = tilesOf('stretch', art.crowdTileWidth);
  const fullW = art.infieldTileWidth ?? 0;
  const onScreen = (x: number, w: number) => x + w > 0 && x < SCREEN_W;
  const fullTiles = setup.turns.flatMap((ta) => (ta.full === null ? [] : [{ x: ta.full - midScroll, full: true, srcX: 0, width: fullW }]))
    .filter((f) => onScreen(f.x, f.width));
  const fills = setup.turns.flatMap((ta) => ta.fills.map((m) => ({ x: m.x - midScroll, full: false, srcX: m.srcX, width: m.w })))
    .filter((f) => onScreen(f.x, f.width));
  const infieldTiles = [...fills, ...fullTiles];
  const flagSpots = art.flagAt
    ? fullTiles.map((f) => ({ x: f.x + art.flagAt![0], y: MID_TOP + art.flagAt![1] }))
      .filter((f) => f.x + (art.flagWidth ?? 8) > 0 && f.x < SCREEN_W)
    : [];
  const visible = new Set<AmbientId>([...(crowdRaw.length ? ['crowd' as const] : []), ...(flagSpots.length ? ['flag' as const] : [])]);
  // Behind the photo the ambient loops stop where they were, and pick up from there after it.
  const ambient = ambientState(rd, { wall: photoWall(p), eighthWall, visible });

  const fastTag = c.fast ? rd.copy.fastTag : null;
  // After the photo has named the winner, "Too close to call" gives way to the winner call.
  const call = callForBar(photoNamesWinner(result, timeline, c)
    ? winnerCallAfterPhoto(result, rd, setup.raceNumber, setup.schedule)
    : announcerAt(setup.schedule, p, toWall, rd.hud.typeCharsPerSecond.value), c.fast);

  return {
    phase,
    raceTime: t,
    cam,
    drawCam,
    fastTag,
    ambient,
    crowdTiles: crowdRaw.map(({ x, k }) => ({ x, frame: ((ambient.crowdSwaps + k) % 2 + 2) % 2, flip: ((k % 2) + 2) % 2 === 1 })),
    infieldTiles,
    flags: flagSpots.map((f) => ({ ...f, frame: ambient.flagFrame })),
    farScroll: layerScroll(drawCam, cfg.farParallaxDivisor),
    midScroll,
    standXs: standTiles(model, drawCam, art.standTileWidth),
    poles,
    gate: { startX: -drawCam, open: phase !== 'gate' },
    horses: sprites,
    arrow: mine ? { x: mine.x + cfg.playerArrowDx, y: mine.y + cfg.playerArrowDy } : null,
    edges,
    call,
    strip,
    dots,
    wireTick: minimapWire(setup.minimap),
    photo: phase === 'photo'
      ? photoFrame(result, rd, timeline, c, photoHorses(result, cfg, art.noseX, art.gallopFrames, me.id), me.id, cfg.playerArrowDx)
      : null,
    hudVisible: phase !== 'photo',
    name: me.name,
    position: finishLine(result.finish, me.id, t, rd.copy)
      ?? positionLine(callAt(result.calls, t), me.id, me.post, result.inputs.tuning.marginLabelBounds.value, rd.copy),
    orders: me.orders,
    clock: winnerIn ? formatClock(winner.time, true) : formatClock(t, false),
    message,
  };
}
