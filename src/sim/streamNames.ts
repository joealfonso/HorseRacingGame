// Every stream name the sim uses, in one place so two systems cannot share one
// by accident. A name is part of every old race's result: never rename or
// reuse one, only add. M1.1 adds none; the first names arrive with the race
// model in M1.3.
export const STREAM_NAMES = [] as const;

export type StreamName = (typeof STREAM_NAMES)[number];
