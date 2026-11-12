import type { Card, Race, Track, Tuning } from '../data/schema';

// The result is the contract with the renderer. Every number the sim works out is a
// whole number in the unit named in `units`, so the JSON is short and plain to read.
// Only the echoed inputs keep the values they came in with.
// The shape only grows from here: fields are added, never changed or removed.

export const UNITS = {
  time: 'hundredths of a second',
  distance: 'hundredths of a foot, from the gate along the rail',
  lane: 'hundredths of a lane, 0 is the rail',
  lengths: 'thousandths of a length',
} as const;

export type PaceLabel = 'hot' | 'honest' | 'slow';
export type EventType = 'blocked' | 'steadied' | 'bumped';

export interface RaceResult {
  simVersion: number;
  seed: number;
  units: typeof UNITS;
  /** Every input, keys sorted and horses by post, so the result describes itself. */
  inputs: { track: Track; race: Race; card: Card; tuning: Tuning };
  /** Places 1 to N, every horse, no ties. */
  finish: FinishEntry[];
  photoFinish: boolean;
  /** The leader's time at each quarter mile from the gate, then the winner's time. */
  fractions: Fraction[];
  pace: { halfMile: number; label: PaceLabel };
  /** Taken as the leader reaches each furlong pole, nearest the gate first. */
  calls: Call[];
  replay: Replay;
}

export interface FinishEntry {
  place: number;
  id: string;
  post: number;
  time: number;
  /** Behind the horse one place ahead, as that horse reached the wire. Null for the winner. */
  margin: { lengths: number; label: string } | null;
  /** Total of the margins above, 0 for the winner. */
  beatenLengths: number;
}

export interface Fraction {
  /** Furlongs from the gate. */
  furlongs: number;
  time: number;
}

export interface Call {
  /** Furlongs left to the wire: the pole's name. */
  furlongsToGo: number;
  time: number;
  /** By running position, leader first. */
  horses: { id: string; position: number; lengthsBehind: number }[];
}

export interface Replay {
  /** Time between samples. Sample i is at i * step from the gate opening. */
  step: number;
  /** Where the straights and turns are, from the gate to the wire. */
  course: { from: number; to: number; turn: boolean }[];
  /** By post. */
  horses: ReplayHorse[];
  /** Every horse at the moment the winner reaches the wire. */
  wireFrame: { time: number; horses: { id: string; distance: number; lane: number }[] };
  /** Empty until luck events are built. */
  events: RaceEvent[];
}

export interface ReplayHorse {
  id: string;
  post: number;
  distance: number[];
  lane: number[];
  finishTime: number;
  /** Ground run beyond the rail path up to the wire. */
  extraGround: number;
}

export interface RaceEvent {
  type: EventType;
  horse: string;
  /** The other horse in a bump, otherwise null. */
  otherHorse: string | null;
  time: number;
}
