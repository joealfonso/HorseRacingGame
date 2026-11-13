// Every stream name the sim uses, in one place so two systems cannot share one
// by accident. A name is part of every old race's result: never rename or
// reuse one, only add.
//
// The M1.3 race model draws all of these per horse (sub-key: horse id), up
// front and in a fixed count, so later systems cannot shift them:
//   form       how well the horse is going today: one bell-shaped number
//   gateBreak  how quickly it leaves the gate
//   rhythm     its speed wobble along the course, one value per furlong
//   kick       when its rider asks and how much it has when asked
//
// M1.5 luck, one stream per event type, also per horse and up front: two draws
// each (is the horse unlucky this way today, and from where on the course), and
// none at all while every luck rate is zero.
//   luckBlocked, luckSteadied, luckBumped
export const STREAM_NAMES = ['form', 'gateBreak', 'rhythm', 'kick', 'luckBlocked', 'luckSteadied', 'luckBumped'] as const;

export type StreamName = (typeof STREAM_NAMES)[number];
