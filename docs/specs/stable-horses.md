# The stable: 40 horses (B4 content)

Status: candidates for Joseph's pick, as with the M1 blurbs (ST3). Written 2026-11-13 by the designer. The game reads `src/data/stable.json`; this file is for review only.

## Problem and reader

The player reads a printed-program page of eight horses, bets on one and watches the race. Over a day they meet all 40. A horse is a name on the program, a blurb when the cursor is on it, and a jacket on the track. So the name has to be funny on paper and still work when the announcer calls it in the stretch. The blurb has to give the horse a character without telling the player how to bet. The jacket has to be told apart at speed.

What the player reads first is the name, then odds and stats, then the blurb. So the name does most of the work and the blurb adds one beat. A blurb never repeats what the stats already say as a number.

## Decisions

- **Stats and styles are the probe's lines, unchanged.** sNN takes line pNN. 14 front-runners, 13 stalkers, 13 closers.
- **The eight kept horses are spread across tiers**: 2 sharp, 4 solid, 2 plain. Each is on a line its blurb is still true to (table below).
- **Joke shapes are capped at about four each**, and no two neighbors in id order share a shape. Shapes used: food (4), legal (3, all from the original eight, so no new legal names), office and texting (4), small domestic disasters (4), racetrack and Kentucky (6, split between racetrack people and Kentucky home life), registry and self-deprecation (3), plus one-offs: barn animal, city animal, travel, hotel, theater, music, school, idiom, manners, prank, wordplay.
- **Blurbs describe a want or a habit, not where the horse will be.** "Wants the lead" is a want. "Up front, waiting for you" says where it will be, which reads like a promise, so I cut it. Same reason I avoided "comes in", "gets there" and "last place".
- **Auburn is never a body color.** It is the bay's body color and the chestnut's shade, and on dark bay and black it is dark on dark. It stays as a cap (Decaf By Mistake keeps its Auburn cap).
- **Dark jackets (Navy, Maroon, Royal, Purple) go only on chestnuts.** A bay's body is Auburn, which is in the dark silks band, so a dark jacket on a bay has hue contrast but no value contrast and fails in grayscale. Red and Orange go on dark bay or black, never on bay (Red) or chestnut (Orange). Decaf By Mistake's Orange on bay is kept from the shipped card.
- **Caps avoid Yellow, Pink and Ink too**, for the same reasons as bodies: the Yellow arrow sits over the cap, Pink is the placeholder, Ink is the outline. Body and cap are always from different value bands.

Rejected: a common format (every name a two-word phrase, or every name a pun). It would be easier to keep in check and would read as filler by the third race.

## The 40

Counts in brackets are characters, including spaces and punctuation.

| id | name [n] | style | spd | sta | kick | jockey [n] | coat | silks body / cap | blurb [n] |
|---|---|---|---|---|---|---|---|---|---|
| s01 | Hold My Oats [12] | front-runner | 94 | 76 | 81 | Marisol Dunne [13] | chestnut | Royal / Bone | Wants the lead and a snack. [27] |
| s02 | Paddock Gossip [14] | stalker | 83 | 84 | 85 | Teodoro Valdivia [16] | bay | Gold / Navy | Knows everyone's business. [26] |
| s03 | Sock In The Dryer [17] | closer | 73 | 90 | 87 | Priya Ramaswamy [15] | dark bay or brown | Sky / Navy | Turns up late, still warm. [26] |
| s04 | Ten Items Or Less [17] | front-runner | 92 | 70 | 75 | Beau Thibodeaux [15] | dark bay or brown | Red / Bone | Express lane, no exceptions. [28] |
| s05 | Legally A Horse [15] | stalker | 78 | 82 | 77 | Dani Ferreira [13] | chestnut | Purple / Gold | Papers say horse. We agree. [27] |
| s06 | Burgoo Weather [14] | closer | 67 | 88 | 80 | Maeve Callaghan [15] | bay | Emerald / Gold | Low heat, long simmer. [22] |
| s07 | Goat Is In Charge [17] | front-runner | 93 | 77 | 71 | Kenji Arakawa [13] | black | Hay / Maroon | Goat said go. So, go. [21] |
| s08 | Smoke Alarm Chirp [17] | stalker | 78 | 76 | 88 | Lucia Barrientos [16] | black | Red / Gold | Quiet, quiet, then BEEP. [24] |
| s09 | Long Story Longer [17] | closer | 72 | 92 | 84 | Odell Fairweather [17] | chestnut | Navy / Lime | Has a lot more to say. [22] |
| s10 | Biscuit Emergency [17] | front-runner | 93 | 77 | 73 | Nadia Kowalczyk [15] | dark bay or brown | Gold / Maroon | Leaves early for the buffet. [28] |
| s11 | Circling Back [13] | stalker | 71 | 71 | 85 | Ruben Echeverria [16] | bay | Turquoise / Navy | Will follow up shortly. [23] |
| s12 | Lost The Remote [15] | closer | 61 | 80 | 78 | Tallulah Grimes [15] | dark bay or brown | Ash / Royal | Stop looking. There it is. [26] |
| s13 | Derby Hat Budget [16] | front-runner | 89 | 71 | 66 | Emeka Adeyemi [13] | chestnut | Purple / Lime | Dressed for the front row. [26] |
| s14 | Ran Out Of Names [16] | stalker | 75 | 73 | 68 | Inez Marroquin [14] | bay | Bone / Navy | Was almost called Steve. [24] |
| s15 | Scenic Route [12] | closer | 58 | 80 | 72 | Wade Holloway [13] | bay | Sky / Maroon | Saw the whole backstretch. [26] |
| s16 | Running Joke [12] | front-runner | 85 | 69 | 77 | Saoirse Duggan [14] | black | Orange / Navy | Starts before you're ready. [27] |
| s17 | Take A Number [13] | stalker | 70 | 71 | 77 | Mateo Alcantar [14] | dark bay or brown | Turquoise / Maroon | Waits its turn. Mostly. [23] |
| s18 | Hay Is For Horses [17] | closer | 58 | 79 | 73 | June Pemberton [14] | bay | Hay / Emerald | Eats well, goes long. [21] |
| s19 | Post Time Panic [15] | front-runner | 82 | 63 | 66 | Linh Truong [11] | dark bay or brown | Red / Navy | Out the door, keys inside. [26] |
| s20 | Polite Applause [15] | stalker | 73 | 73 | 69 | Esperanza Villalobos [20] | chestnut | Maroon / Bone | Applauds the pace, quietly. [27] |
| s21 | Late Checkout [13] | closer | 60 | 78 | 80 | Ferris Lockhart [15] | chestnut | Navy / Gold | Asks for one more hour. [23] |
| s22 | Porch Light On [14] | front-runner | 87 | 71 | 74 | Greta Lindqvist [15] | bay | Gold / Purple | Keeps the light on for you. [27] |
| s23 | Bring A Sweater [15] | stalker | 69 | 69 | 72 | Amos Whitlock [13] | chestnut | Maroon / Hay | Has a scarf. Just in case. [26] |
| s24 | Left On Read [12] | closer | 63 | 71 | 79 | Hollis Tran [11] | bay | Sky / Bone | Typing... still typing... [25] |
| s25 | Mayor Of Turn Two [17] | front-runner | 86 | 69 | 67 | Yesenia Duarte [14] | chestnut | Royal / Gold | Waves at everyone, early. [25] |
| s26 | Mint Julep Lawsuit [18] | stalker | 75 | 74 | 69 | Imogen Pruitt [13] | dark bay or brown | Turquoise / Gold | Sweet, cold, and litigious. [27] |
| s27 | Unexpected Banjo [16] | closer | 62 | 82 | 80 | Corbin Ashby [12] | dark bay or brown | Lime / Navy | Joins in on the last verse. [27] |
| s28 | Reply All [9] | front-runner | 85 | 73 | 65 | Walt Pettibone [14] | chestnut | Lime / Royal | Cc's the entire grandstand. [27] |
| s29 | Understudy [10] | stalker | 77 | 75 | 67 | Hana Takeda [11] | black | Ash / Purple | Knows the lead's lines. [23] |
| s30 | Decaf By Mistake [16] | closer | 69 | 77 | 84 | Rosa Kettering [14] | bay | Orange / Auburn | Wakes up at the far turn. [25] |
| s31 | Parking Lot Pigeon [18] | front-runner | 76 | 61 | 63 | Lionel Okafor [13] | bay | Ash / Navy | First to every crumb. [21] |
| s32 | Group Project [13] | stalker | 68 | 69 | 61 | Della Mayhew [12] | dark bay or brown | Hay / Purple | Made the title slide. [21] |
| s33 | Extra Long Receipt [18] | closer | 59 | 73 | 68 | Rafael Montalvo [15] | bay | Bone / Emerald | Prints for a full furlong. [26] |
| s34 | Unsolicited Advice [18] | front-runner | 73 | 52 | 61 | Agnes Faulkner [14] | bay | Emerald / Bone | Chimes in right away. [21] |
| s35 | Medium Everything [17] | stalker | 65 | 65 | 64 | Tobias Wren [11] | chestnut | Royal / Hay | Orders the usual. Again. [24] |
| s36 | Saved It For Later [18] | closer | 57 | 72 | 73 | Paloma Ibarra [13] | chestnut | Purple / Hay | Unwraps it in the stretch. [26] |
| s37 | Doorbell Ditch [14] | front-runner | 76 | 51 | 59 | Silas Penhallow [15] | dark bay or brown | Orange / Bone | Rings once and runs. [20] |
| s38 | Gravy Subpoena [14] | stalker | 69 | 68 | 72 | Cal Broussard [12] | dark bay or brown | Bone / Red | Served papers to the leader. [28] |
| s39 | Mostly Legs [11] | closer | 59 | 78 | 72 | Anselm Voss [11] | bay | Emerald / Hay | The rest is mostly lungs. [25] |
| s40 | Big Plans Monday [16] | front-runner | 71 | 59 | 60 | Ingrid Solberg [14] | black | Lime / Maroon | Agenda item one: the lead. [26] |

Checks done by reading: 40 records, ids s01 to s40 in probe order, every stat line used once and copied unchanged, 14 front-runners, 13 stalkers, 13 closers. No duplicate name or jockey. Longest name 18, longest jockey 20, longest blurb 28. All straight quotes and printable ASCII.

## The eight kept horses

| horse | line | tier | why this line |
|---|---|---|---|
| Hold My Oats | p01 (94/76/81) | sharp | Wants the lead, so it gets the fastest front-runner line. |
| Legally A Horse | p05 (78/82/77) | sharp | Stalker with stamina on top, as on the shipped card. The blurb is about the name, so any stalker line works. |
| Reply All | p28 (85/73/65) | solid | A front-runner with speed clearly its best stat, so "out where everyone can see it" holds. |
| Mint Julep Lawsuit | p26 (75/74/69) | solid | The blurb is about the name; a mid stalker line. |
| Left On Read | p24 (63/71/79) | solid | Kick is its best stat, which is the late reply in the blurb. |
| Decaf By Mistake | p30 (69/77/84) | solid | Kick 84 is its best stat: wakes up late. |
| Gravy Subpoena | p38 (69/68/72) | plain | A stalker; the blurb is about stalking the leader, true on any stalker line. |
| Mostly Legs | p39 (59/78/72) | plain | Stamina is its best stat by a clear margin, and speed 59 matches the shipped 58. |

**One forced change.** Legally A Horse was a Purple jacket on a black coat, a dark jacket on a dark coat, which the silks rule names as a weak pair. I changed its coat to chestnut and kept the Purple and Gold silks, because the silks are what the player tracks on the card and the track. If Joseph would rather keep the black horse, the alternative is to swap the jacket and cap (Gold body, Purple cap). That puts Gold at 4 bodies, so one of the three Gold horses would need a new color.

Nothing else changed on the eight: names, jockeys, blurbs, the other seven coats and all silks are as in `card.json` and `cardLook.json`.

## Body-color counts

14 of the 18 colors are used as bodies. Yellow, Pink and Ink are out by rule, and Auburn is out because it reads poorly on every coat.

| body | count | horses |
|---|---|---|
| Navy | 2 | s09, s21 |
| Maroon | 2 | s20, s23 |
| Royal | 3 | s01, s25, s35 |
| Purple | 3 | s05, s13, s36 |
| Red | 3 | s04, s08, s19 |
| Emerald | 3 | s06, s34, s39 |
| Ash | 3 | s12, s29, s31 |
| Turquoise | 3 | s11, s17, s26 |
| Sky | 3 | s03, s15, s24 |
| Orange | 3 | s16, s30, s37 |
| Gold | 3 | s02, s10, s22 |
| Hay | 3 | s07, s18, s32 |
| Lime | 3 | s27, s28, s40 |
| Bone | 3 | s14, s33, s38 |
| Auburn, Yellow, Pink, Ink | 0 | |

Total 40. With 14 colors for 40 horses, 12 colors must be at the cap of 3. No full jacket-and-cap pair repeats.

Coats: bay 13, chestnut 11, dark bay or brown 11, black 5.

## Least sure

Names:
1. **Medium Everything** (s35, the plainest balanced line). The joke is that it is average at everything, which comes close to telling the player its class. Alternative: **Junk Drawer** [11], "A bit of everything." [20].
2. **Doorbell Ditch** (s37). A kid's prank, mild, but it is the only name built on someone being annoyed. Alternative: **Leaving On Three** [16], "Two was close enough." [21].
3. **Ten Items Or Less** (s04). It is a store sign, so it may read as signage, not a horse, when the announcer says it. Alternative: **Express Lane Only** [17], keeping the same blurb.

Blurbs:
1. **Lost The Remote: "Stop looking. There it is."** It could read as a promise that the horse shows up at the end. Alternative: "Check under the cushions." [25].
2. **Scenic Route: "Saw the whole backstretch."** It nods at speed 58, and a player could read it as "always far back". Alternative: "Took the long way, happily." [27].
3. **Hay Is For Horses: "Eats well, goes long."** "Goes long" is close to rating its stamina. Alternative: "Has strong feelings on hay." [27].

## Rules that fought the writing

- **Closers all want the same joke.** A closer's style is "late", so late, waking up, and turning up kept coming back. I gave each a different picture (a sock, a remote, a banjo, a hotel, a present, a receipt) and kept the word "late" to one blurb (Sock In The Dryer), not counting the shipped ones.
- **Front-runner blurbs drift into promises.** The honest thing to say about a front-runner is that it leads, which is a forecast. I wrote wants and habits instead ("Agenda item one: the lead", "Dressed for the front row").
- **Colors.** Ruling out Yellow, Pink, Ink and Auburn leaves 14 bodies for 40 horses, so 12 colors sit at the cap. The draw has to work around those repeats, and every new horse added later will push a color over the cap. If the stable grows, patterned silks (stripes, hoops) are what fix this, not more colors.
- **The legal names were full.** The original eight already hold three legal jokes (Legally A Horse, Gravy Subpoena, Mint Julep Lawsuit), the shape the owner clearly likes, so none of the 32 new names is legal.
- **Real-horse check.** I checked against the 13 Triple Crown winners and the famous names I know. I cannot search the Jockey Club registry, so a minor real horse may share a name. None of these is a notable horse that I know of.
