import type { RaceDay } from '../data/raceDaySchema';
import { fillTemplate } from '../data/template';

// The betting screens' money and ticket strings (docs/specs/betting-screens.md section 8),
// filled from copy in data. Every amount comes in from the betting code; nothing here
// works out a price, a payout or a bankroll.

type Copy = RaceDay['copy'];

const commas = (n: number): string => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

/** A money figure in cents: "$1,234.50". Whole cents, never negative on these screens. */
export function money(cents: number): string {
  if (!Number.isInteger(cents) || cents < 0) throw new Error(`money: expected whole cents of 0 or more, got ${cents}`);
  return `$${commas(Math.floor(cents / 100))}.${String(cents % 100).padStart(2, '0')}`;
}

/** A bet amount in whole dollars, no cents: "$10". */
export const stake = (dollars: number): string => `$${commas(dollars)}`;

/** Header line 1's right side: "Bank $100.00". */
export const bankLine = (copy: Copy, cents: number): string => fillTemplate(copy.program.bank, { amount: money(cents) });

/** Header line 1's left side: "Race 3 of 8". */
export const raceOfLine = (copy: Copy, race: number, races: number): string => fillTemplate(copy.program.race, { r: race, n: races });

/**
 * The ticket's amount: "< $10 >  on #3". With only one amount offered the arrows are not
 * drawn (spaces keep the line where it was), so nothing hints at a choice that is not there.
 */
export function ticketAmountLine(copy: Copy, dollars: number, post: number, oneAmount: boolean): string {
  const line = fillTemplate(copy.ticket.amount, { amount: stake(dollars), n: post });
  return oneAmount ? line.replace(/[<>]/g, ' ') : line;
}

/** "$10 to win pays $37.00": the total returned, stake included. */
export const ticketPaysLine = (copy: Copy, dollars: number, paysCents: number): string =>
  fillTemplate(copy.ticket.pays, { amount: stake(dollars), total: money(paysCents) });

/** The printed tote ticket: "Race 3, $10 to win on #3" and "Legally A Horse at 5-2". */
export const printedTicketLines = (copy: Copy, race: number, dollars: number, post: number, name: string, odds: string): [string, string] => [
  fillTemplate(copy.ticket.printed[0], { r: race, amount: stake(dollars), n: post }),
  fillTemplate(copy.ticket.printed[1], { name, odds }),
];

/** Race HUD line 3 with a bet: "$10 to win, 5-2", the odds at post. */
export const hudBetLine = (copy: Copy, dollars: number, odds: string): string => fillTemplate(copy.hud.bet, { amount: stake(dollars), odds });

/** Result trip line 5 for a winning ticket: "$10 to win paid $37.00". */
export const resultPaidLine = (copy: Copy, dollars: number, returnCents: number): string =>
  fillTemplate(copy.result.paid, { amount: stake(dollars), total: money(returnCents) });

/** Result trip line 5 for a losing ticket: "Lost $10 at 5-2". */
export const resultLostLine = (copy: Copy, dollars: number, odds: string): string => fillTemplate(copy.result.lost, { amount: stake(dollars), odds });

/** Result time line 3: "$2 to win paid $7.20", the winner's $2 price. */
export const winPriceLine = (copy: Copy, twoDollarCents: number): string => fillTemplate(copy.result.winPrice, { price: money(twoDollarCents) });
