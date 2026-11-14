import { startEstimate, stepEstimate, type EstimateJob } from '../bet/estimate';
import type { GameData } from '../data/schema';

// The odds estimate off the main thread (betting-simple.md UI5 and UI6, docs/DECISIONS.md
// "Betting, B1 and B2"). One request is one race's whole estimate: about 1,000 sim runs,
// some seconds of work, none of it on a frame. Requests are answered in the order they
// came. The job goes back whole, so the program can check it is for its own day and race.

export interface EstimateRequest {
  key: string;
  field: GameData;
  daySeed: number;
  race: number;
  runs: number;
}

export type EstimateReply = { key: string; job: EstimateJob } | { key: string; error: string };

const scope = self as unknown as {
  onmessage: ((e: MessageEvent<EstimateRequest>) => void) | null;
  postMessage: (reply: EstimateReply) => void;
};

scope.onmessage = (e) => {
  const { key, field, daySeed, race, runs } = e.data;
  try {
    const job = stepEstimate(startEstimate(daySeed, race, runs, field.card.horses.length), field, runs);
    scope.postMessage({ key, job });
  } catch (err) {
    scope.postMessage({ key, error: err instanceof Error ? err.message : String(err) });
  }
};
