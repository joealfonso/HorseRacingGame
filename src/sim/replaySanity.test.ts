import { describe, expect, it } from 'vitest';
import { runRace } from './runRace';
import { seedRange, shipped, timeReaching } from './testkit';

// O9: replay sanity over 500 seeds. The seed range is fixed, so this cannot flake.
const data = shipped();
const SEEDS = seedRange(1, 500);
const results = SEEDS.map((s) => runRace(data, s));
const ceiling = data.tuning.speedCeilingFeetPerSecond.value;
const laneMax = data.tuning.laneMax.value;
const wire = data.race.distanceFurlongs * 66000;

describe('O9: replay sanity over 500 seeds', () => {
  it('uses 500 seeds', () => expect(results).toHaveLength(500));

  it('no horse\'s distance goes down between samples', () => {
    // Collect problems and assert once: millions of samples are too many to assert one by one.
    const bad: string[] = [];
    for (const r of results) {
      for (const h of r.replay.horses) {
        for (let i = 1; i < h.distance.length; i++) {
          if (!(h.distance[i] >= h.distance[i - 1])) bad.push(`seed ${r.seed} ${h.id} sample ${i}: ${h.distance[i - 1]} then ${h.distance[i]}`);
        }
      }
    }
    expect(bad.slice(0, 5)).toEqual([]);
  });

  it('no horse moves faster than the ceiling in tuning between two samples', () => {
    for (const r of results) {
      // distance is in hundredths of a foot and the step in hundredths of a second
      const most = (ceiling * 100 * r.replay.step) / 100;
      let fastest = 0;
      for (const h of r.replay.horses) {
        for (let i = 1; i < h.distance.length; i++) fastest = Math.max(fastest, h.distance[i] - h.distance[i - 1]);
      }
      expect(fastest, `seed ${r.seed}`).toBeLessThanOrEqual(most);
    }
  });

  it('lanes stay within 0 (the rail) and the maximum in tuning', () => {
    const bad: string[] = [];
    const ok = (l: number) => l >= 0 && l <= laneMax * 100;
    for (const r of results) {
      for (const h of r.replay.horses) {
        for (const l of h.lane) if (!ok(l)) bad.push(`seed ${r.seed} ${h.id} lane ${l}`);
      }
      for (const h of r.replay.wireFrame.horses) if (!ok(h.lane)) bad.push(`seed ${r.seed} wire frame ${h.id} lane ${h.lane}`);
    }
    expect(bad.slice(0, 5)).toEqual([]);
  });

  it('the replay finish moments agree with the result times to the hundredth', () => {
    for (const r of results) {
      for (const f of r.finish) {
        const h = r.replay.horses.find((x) => x.id === f.id)!;
        expect(h.finishTime, `seed ${r.seed} ${f.id}`).toBe(f.time);
      }
    }
  });

  it('and the moment each horse crosses the wire in the replay samples is the same moment', () => {
    for (const r of results) {
      for (const h of r.replay.horses) {
        const crossed = timeReaching(h, r.replay.step, wire)!;
        expect(Math.abs(crossed - h.finishTime), `seed ${r.seed} ${h.id}`).toBeLessThanOrEqual(1);
      }
    }
  });

  it('in the wire frame no horse is ahead of the winner', () => {
    for (const r of results) {
      const w = r.replay.wireFrame;
      const winner = w.horses.find((h) => h.id === r.finish[0].id)!;
      for (const h of w.horses) expect(h.distance, `seed ${r.seed} ${h.id}`).toBeLessThanOrEqual(winner.distance);
    }
  });

  it('the wire frame is at the winner\'s finish moment', () => {
    for (const r of results) expect(r.replay.wireFrame.time).toBe(r.replay.horses.find((h) => h.id === r.finish[0].id)!.finishTime);
  });
});
