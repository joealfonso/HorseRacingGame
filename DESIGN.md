# DESIGN.md: Bluegrass Dynasty visual direction

**Status: Approved by Joseph on 2026-11-12, as drafted.** Sprite work can start. Drafted by art-director on 2026-11-11 from docs/BRIEF.md. Anything marked (guess) is my call, not Joseph's, and is open to change through a DESIGN.md change.

## Approved by Joseph on 2026-11-12

1. The 4-colors-per-sprite rule applies per layer, not per composite horse (see Horses).
2. Horses are 32x24, outside the brief's 16x16 or 16x24 character sizes (see Horses).
3. No NES-honest toggle (see NES-honest toggle).
4. The race view shows silks from pattern and colors only. Freehand pixels in the 16x16 editor show in menus and results, not on the race sprite (see Silks).
5. The 42-color palette below.

Amended 2026-11-12 by art-director after Joseph's note on charm: added the charm goal, the Charm section, the placeholder race rule, one Do not line and one banned look. No approved rule was removed or loosened.

Amended 2026-11-12 by art-director with the M1 race-day answers below: edits to (guess) items and additions only. No approved rule was removed or loosened. Two answers touch approved lines (4 and 6) and are left for Joseph.

Amended 2026-11-12 by art-director after the first art review (P0 batch). Changed: the stand-in saddlecloth box (7x9, so every number has fill above and below), the stand-in leg rule (legs at least as long as the barrel is deep, not longer, because the 32x24 frame cannot hold both), the edge marker (8x9, so it keeps a full Ink outline and gets a center row for its tip), the gate's end posts and outline spelled out, a stroke rule for the main font, the intake checklist file paths (slot path under public/assets/, scripts in scripts/art/), and the saddlecloth and furlong pole sources. One approved-era rule was loosened, the leg rule, and only for the P0 stand-in; the Horses line "long legs" is unchanged.

Amended 2026-11-13 by art-director after the fourth art review (Card, Orders, paddock art). Added: the 3-color rule for people, with Ink allowed to part two same-color parts (an exception to "interior edges use the shade color", for people only, because a 3-color person has no shade slot), the round-face rule, the scale of people beside race horses, the paddock strip's row order with its Turf far band, and a rule keeping background lines off faces and a horse's back line. No approved rule was removed. The interior-edge exception is a narrow bend of a rule from the approved draft, stated here so Joseph can see it.

Amended 2026-11-13 by art-director after the third art review (photo and result screens). Added: the photo's own vertical layout (lanes 8 px apart, the occupied block centered), Ash flanks on the photo wire, the frozen race view behind the photo, spacing for icons in text rows, and the small font's baseline when it shares a line. Changed: the photo is no longer a literal vertical crop of race-view rows y77-164; horizontal positions are unchanged. No approved rule was loosened.

Amended 2026-11-12 by art-director after the second art review (step 2 batch). Added or settled: rider outlines across layers, the walk and winner stand-in frames, what "stands in the irons" means at 32x24 and how the raised arm is drawn, the crowd strip's rows, colors and tiling, the infield slice rule and opaque mid-layer zones, and a ban on national and state flags. One line touches an approved rule and is left for Joseph: the crowd strip is a second layer over the grandstand and counts as its own tile for the 4-color rule (see Charm, Crowd).

## M1 race-day answers (2026-11-12)

Answers to section 12 of docs/specs/m1-race-day.md. Where this list and the spec disagree, this list wins.

1. Top bar: yes, announcer only, an unframed strip. See HUD, UI frame and font.
2. Furlong poles on the far (inside) rail, behind the horses: yes. See Race view.
3. Photo: yes, 112x88 crop at 2x in a 240x192 panel, wire 2 px on screen. See Race view.
4. Placeholder label: open for Joseph, the line is approved. P0 builds the checker, HUD tag and console list. See Named art and audio slots.
5. Saddlecloths 1 to 8 and the Pink clash. See Jockeys and silks.
6. Silks body and cap per horse in M1: yes. Results show the saddlecloth box in M1, flagged to Joseph. See Jockeys and silks.
7. Trainer on the Orders (paddock) screen: yes. See Charm.
8. Winner beat staged after the wire hold: yes. See Charm.
9. Paddock horse idle: no, stand frame only in M1. See Charm.
10. Generic grandstand, no twin spires: yes. See Originality.
11. Ambient set per zone: yes, with the crowd tiles out of phase. See Charm.
12. Post parade: yes, direction and escorts to check. See Charm.
13. Gate behind the horses: yes, door column ahead of the noses. See Race view.
14. Typewriter calls: yes before the 1/8 pole, whole calls from it. See Charm.
15. Small font: the designer's 16 glyphs, nothing added. Main font: printable ASCII 32 to 126. See HUD, UI frame and font.
16. Garland and traditions off in M1: yes. See Charm.
- Also: the P0 stand-in race horse. See Horses.

## Vision

A warm Kentucky morning on an NES cartridge: big calm shapes, a small honest palette, and horses drawn like the athletes they are.

Charm is a goal, not a garnish. Joseph, 2026-11-12: "8-bit type graphics remember. it should be charming". The horses stay athletes, so the charm comes from the world around them, the ceremony of race day, and the people and words (see Charm).

## Screen and pixel grid

- Internal resolution 256x240. Integer scaling only (3x on a 768-high laptop, 4x on 1080p). Leftover window space is filled with Ink, never stretched.
- Phaser runs with `pixelArt: true` and `roundPixels: true`. The canvas is scaled with `image-rendering: pixelated`.
- Tiles are 16x16. A screen is 16 by 15 tiles.
- Characters are 16x24 (people) or 16x16 (small animals: barn cat, goat, dog). Horses have their own sizes below.
- A sprite, or one layer of a layered sprite, uses at most 4 colors including transparent, so 3 opaque colors.
- A background tile uses at most 4 colors.
- Every pixel lands on the 1x grid. No sub-pixel positions, no smooth motion between pixels. Positions are rounded once from the camera value, so all layers round together and nothing shimmers.
- No rotation and no non-integer scaling of any sprite. Horizontal flip is allowed.
- No smooth gradients, no alpha blending, no translucent overlays. Alpha is 0 or 255.

## Master palette

42 colors. NES-flavored values of my own choosing, not copied from any hardware table. 42 is enough for six coats with markings, three track surfaces in every going, the farm, sky, UI and 18 silks colors, and stays under the roughly 54 colors the NES could show, so the game still reads as 8-bit. A small set also forces reuse: the same Auburn is a bay coat, a chestnut shadow and brown silks, which keeps screens coherent.

No color outside this table goes in the build. Adding one is a DESIGN.md change.

| id | name | hex | jobs |
|---|---|---|---|
| N0 | Ink | #14111C | outlines, black points, text shadow, letterbox |
| N1 | Coal | #2E2A38 | black coat base, young gray shade, dark UI |
| N2 | Slate | #575464 | young gray base, stone, hooves |
| N3 | Ash | #8E8A98 | middle gray base, UI inner border, gray silks |
| N4 | Mist | #C7C3CC | old gray base, roan ticks, far-side socks, photo streaks |
| N5 | Bone | #F6F0E2 | white markings, rails, text, clouds, white silks |
| C0 | Copper | #C46A32 | chestnut base |
| C1 | Auburn | #8E4526 | bay base, chestnut shade, roan base, brown silks |
| C2 | Mahogany | #5C2B1A | dark bay base, bay shade, roan points shade |
| C3 | Bitter | #351812 | dark bay shade, darkest skin shade |
| C4 | Sheen | #4B4D68 | black coat highlight |
| C5 | Roan | #A87C72 | roan body wash |
| K0 | Peach | #F4C9A0 | lightest skin |
| K1 | Tan | #D29A68 | skin |
| K2 | Umber | #9C6440 | skin |
| K3 | Cocoa | #603A26 | darkest skin |
| E0 | Parchment | #EEDCAA | pedigree and results pages, paper |
| E1 | Dirt | #C99C5E | dirt track fast and good, paths |
| E2 | Dirt Shade | #9A6E3E | dirt grain, hoof kick, wood |
| E3 | Mud | #64452A | sloppy and muddy going, wet dirt |
| E4 | Synthetic | #604A4C | synthetic track base |
| E5 | Synthetic Light | #8A6E6A | synthetic fiber flecks |
| G0 | Leaf | #9CD474 | sunlit grass, tree highlights |
| G1 | Grass | #58A844 | farm grass, turf light stripe |
| G2 | Turf | #2E8038 | turf track, firm going |
| G3 | Pine | #1C4C2C | tree shadow, yielding turf, forest green silks |
| G4 | Hay | #CDB85C | hay, straw, dry grass, khaki silks |
| S0 | Sky Pale | #B0D8F6 | horizon band, puddle glints, water highlight |
| S1 | Sky | #5E9FE6 | day sky, water, light blue silks |
| S2 | Dusk | #EC9060 | evening sky band |
| R0 | Red | #D8302C | silks, warnings, money down |
| R1 | Maroon | #842234 | silks, barn trim |
| R2 | Orange | #F2862A | silks |
| R3 | Gold | #DEA630 | silks, trophies, roses accent |
| R4 | Yellow | #F8DA3A | silks, cursor, your-horse marker |
| R5 | Lime | #B8E020 | silks |
| R6 | Emerald | #1AA85A | silks, money up |
| R7 | Turquoise | #22BCB4 | silks |
| R8 | Royal | #2A54D6 | silks |
| R9 | Navy | #1C2A78 | silks, UI box fill, night sky |
| R10 | Purple | #7A3AC2 | silks |
| R11 | Pink | #F28CBA | silks, placeholder art |

Value bands for silks (computed by me from a luma formula, not checked by eye, guess):

- Dark: Ink, Navy, Maroon, Auburn, Royal, Purple
- Mid: Red, Emerald, Ash, Turquoise, Sky, Orange
- Light: Gold, Pink, Hay, Lime, Yellow, Bone

## NES-honest toggle

Left out. The rules it would tighten are 8 sprites per scanline (with flicker) and 4 sprite palettes plus 4 background palettes on screen at once. A 20-horse field with layered horses breaks both on the first frame: the field would flicker and 20 silks would have to share 4 palettes. That hurts readability, which is the test for the race view, and adds a rule without making a better race. The part worth keeping is always on: 4 colors per background tile.

## Shapes and shading

- Light comes from the upper left. Each material gets two tones, base and shade. A third tone only where a layer has a free slot.
- Sprites get a 1px Ink outline on the outer silhouette. Background tiles get no outline. That split is what keeps sprites readable over busy ground.
- Inside a sprite, edges use the shade color, not Ink, except eyes, hooves and boots.
- Big calm shapes, a few focused details. Every detail has a job you can say in one sentence.
- Dither is texture only (dirt grain, synthetic fiber, roan ticks), in a fixed pattern. Never a ramp.
- Sky is hard-edged horizontal bands (Sky, Sky Pale, Dusk at evening). No blends.
- Time of day and weather change by palette remap to darker or wetter entries, never by an overlay.
- Silhouette test: fill a sprite with Ink. If the pose does not read, redraw it.
- Keep long background lines (rails, planks, horizon bands) off faces and off a horse's back line. If one would cross there, move the line, not the figure.

## Horses

Horses are athletes. Real thoroughbred proportions: long legs, deep chest, a head small for the body, front knees and hind hocks bending the right way. No cartoon faces, no human expressions, no oversized eyes.

### Sizes and frames

- Race view: 32x24 frame holding horse and jockey together, facing right. (guess)
- Overworld: the same 32x24 side view for left and right (flipped), 16x32 for up and down. (guess)
- Horse card portrait: 48x48 head and neck in profile, same layer system, so markings read up close. (guess)
- Conflict with the brief: at 16x24 a horse is the size of a person, and reads as a pony or a dog. I want horses exempt from the character sizes.
- Race frames: 4-frame gallop, 2-frame walk (post parade, pulling up), 1 standing frame (gate). (guess, 6 gallop frames if 4 looks choppy at the finish)
- The 1px body bob is drawn into the frames, not moved by code.
- Gallop frames advance by distance covered, so faster horses stride faster and feet never slide.
- Each horse starts its cycle at a phase set by its program number, so the field never moves in lockstep. This is render-only and never touches the sim's RNG.
- Each race frame records the nose x in its slot data. Finish line and photo-finish margins use the nose, not the frame box.

### Layers and the 4-color rule

The 4-color rule applies per layer. Each layer is its own sprite with 3 opaque colors plus transparent, the way NES games stacked sprites for more color. A composite horse shows more than 4 colors. Every layer uses Ink for its outline so the stack reads as one shape.

Layers are drawn in this order, all with the same frame size, frame count and anchor:

| layer | slot 1 | slot 2 | slot 3 |
|---|---|---|---|
| body | Ink outline | coat base | coat second tone |
| mane_tail (mane, tail, lower-leg points) | Ink | points base | points second tone |
| markings | Bone (white) | Mist (far-side socks, roan ticks) | Roan (roan wash) |
| tack (saddle, bridle, saddlecloth) | Ink | saddlecloth color | saddlecloth trim |
| jockey_body (face, breeches, boots) | Ink | skin tone | Bone |
| jacket | Ink | silks body color | silks pattern color |
| cap | Ink | cap color | cap second color |

Recolorable layers are authored in key colors and swapped in code: slot 1 = Ink, slot 2 = Ash, slot 3 = Slate. Markings, jockey_body and tack are authored in their real colors except where the table says the color comes from data.

### Coats

| coat | body base | body second | points base | points second |
|---|---|---|---|---|
| bay | Auburn | Mahogany | Ink | Coal |
| dark bay or brown | Mahogany | Bitter | Ink | Coal |
| chestnut | Copper | Auburn | Copper | Auburn |
| black | Coal | Sheen (highlight on the top line) | Coal | Ink |
| gray | see below | | | |
| roan | Auburn | Mahogany | Auburn | Mahogany, plus Roan wash and Mist ticks on the barrel from the markings layer |

Slot 3 is the coat's second tone. For every coat it is the shade, except black, where it is the sheen highlight.

Gray horses lighten with age, as real grays do, in three palette steps (guess, cheap because it is only a remap):

| age | body base | body second | points base | points second |
|---|---|---|---|---|
| foal to 3yo | Slate | Coal | Coal | Ink |
| 4yo to 6yo | Ash | Slate | Slate | Coal |
| 7yo and up | Mist | Ash | Ash | Slate |

### Markings

Each marking is its own mask in the markings layer and is switched on from data.

- Star: a Bone spot on the forehead. Can combine with strip.
- Strip: a narrow Bone line down the face.
- Blaze: a wide Bone line down the face. Replaces star and strip.
- Socks: per leg, Bone below the fetlock on the near legs, Mist on the far legs so they sit back.
- Roan wash and ticks: barrel only, so the head and legs stay darker, the way a roan looks.

At race size a star is 1 pixel. Markings are flavor in the race and identity on the horse card and in the barn. Nobody needs to read a star at gameplay speed.

### Readability test

Every race sprite is checked in a full 20-horse field, at gameplay speed, on dirt, turf and synthetic, at 3x and 4x. You must be able to find your horse in under a second and tell the leaders apart. Known risks I have not checked by eye: bay on turf, chestnut on dirt, dark coats on mud and synthetic. The Ink outline is the main defense.

### Stand-in race horse (P0)

A committed script draws it. Frames: gallop A (reach), gallop B (gather), stand. Faces right. Coordinates are inside the 32x24 frame, x0 left, y0 top, boxes include their 1 px Ink outline.

| part | layer | where | colors |
|---|---|---|---|
| horse | body | barrel x8-22, y9-16 in A and stand, y8-15 in B; legs from the belly to the hoof line y23 | Ink outline, coat base only |
| nose | body | rightmost opaque column is x31 in every frame, so `nose_x` = 31. Nose y: A 10, B 9, stand 6 | |
| saddlecloth | tack | A closed 7x9 Ink box at x8-14, y8-16 (y7-15 in B, it rides with the body), fill 5x7 at x9-13, y9-15 (y8-14 in B). Number 3x5 at x10-12, y10-14 (y9-13 in B), so it has a fill row above and below and an Ink number never touches the Ink outline. The top row sits 1 px above the back line behind the rider: that bump is the cloth's top edge under the saddle. The bottom row lies on the belly line and also closes the 2 px flank gap at x9-10, so the cloth never depends on the body layer for its outline | Ink, cloth fill, number in the trim slot |
| jacket | jacket | x12-20, y2-8, the same in every frame. Ink arm from x21 y6 to the hands on the crest. Ink leg from the seat down to a bent knee and the boot at x15-16 y11-12 | Ink, silks body |
| cap | cap | x20-24, y0-3, the same in every frame. 1 px Ink peak at x25 y3 | Ink, cap color |
| arrow | marker | 7x4, centered over the cap, bottom row 2 px above the frame top | Yellow |

Accepted only if, filled with Ink, each frame reads as a horse with a rider:

- Four legs, at least 8 px from belly to hoof, and at least as long as the barrel is deep (8 rows against an 8-row barrel in gallop A and stand, 9 in gallop B). Shorter is a reject. (Was "longer than the barrel is deep", which the 32x24 frame cannot hold with a barrel deep enough for the saddlecloth number.) Daylight under the belly in every frame. Front knees fold back, hocks point back.
- Gallop A has the forelegs reaching forward and the hinds reaching back. Gallop B has them folded under. Stand has four straight legs in two pairs, the far leg of each pair 1 px behind.
- A neck that rises forward from the withers and is longer than the head. A head small for the body, with a throat notch, tapering to the muzzle.
- A tail as its own stroke off the croup.
- The rider as a crouched person: the cap 2 px above the back line and ahead of the shoulders, so the head is a bump, not a box.
- Legs 2 px wide may be all Ink. At most a 1 px Ink eye. No mouth, no brow, nothing larger.

Rider outlines: the 1 px Ink outline is judged on the composite of layers that are always drawn together. The jacket may take its top edge from the cap's bottom row, since the cap never draws without the jacket. A layer that can draw alone keeps its own outline.

Walk and winner (step 2 stand-ins): the walk keeps the barrel at y9-16 in both frames, so the rider and the saddlecloth do not move. The head is carried at about withers height and nods 1 px (nose y8, then y9), because a low head on this barrel reads as a cow in the Ink fill test. The rider sits up at the walk, with the same pixels in both frames. The winner pose rides on the walk body and is described under Charm, Winner.

Its charm: the rider rides still. The jacket and cap are the same pixels in every frame while the horse bobs 1 px and its head nods under him, the way a good jockey holds his head level at the gallop. It is a real thing, it costs nothing, and it keeps the Yellow arrow steady. A 1 px pricked ear on the poll is also allowed.

Reject: a box with legs, a dog or pony shape, a head a third of the body, legs shorter than the barrel is deep, the rider floating above the back, any expression.

## Jockeys and silks

- Silks are designed at 16x16 with a pattern (stripes, hoops, diamonds, quartered, sash, or solid) and 2 to 3 colors: body, pattern, cap. The cap may repeat body or pattern.
- Silks colors are the 18 in the value bands list.
- Body and pattern colors must come from different value bands, so silks read in grayscale and for colorblind players.
- On the race sprite the jacket is about 7x6 pixels. It is drawn from a fixed pattern mask for each pattern type plus the colors, not by shrinking the 16x16 design. The body color covers at least half the jacket so it carries at speed.
- If the editor allows freehand pixels, they show in the silks designer, owner card and results, not in the race view. (approved 2026-11-12)
- Results show the full 16x16 silks beside each finisher.
- 20 starters and 18 colors means body colors can repeat in a field. No two stables in one race may share the same body color, pattern color and pattern. Rival and generated silks are picked to avoid clashes. The player is warned on a clash.
- Two horses from the same stable wear the same jacket and are told apart by cap color, as in real racing.
- Saddlecloth color follows the program number, modeled on the US saddlecloth convention. The 1 to 20 color list lives in data and must be checked against a primary source before it ships. Numbers 1 to 8, for M1, are below. 9 to 20 wait for a race with more than 8 starters and are still to check.
- Source for 1 to 8: Oregon racing rule OAR 462-150-0060 (8)(i), https://oregon.public.law/rules/oar_462-150-0060, lists these eight colors as the table has them (looked up by the artist on 2026-11-12, not reopened by art-director). No Kentucky rule assigning saddlecloth colors was found, so the game follows the Oregon list as the US convention. Still to check: whether Kentucky tracks use the same colors in practice.

| # | fill | number | US convention (checked: OAR 462-150-0060 (8)(i)) |
|---|---|---|---|
| 1 | Red | Bone | red, white number |
| 2 | Bone | Ink | white, black number |
| 3 | Royal | Bone | blue, white number |
| 4 | Yellow | Ink | yellow, black number |
| 5 | Emerald | Bone | green, white number |
| 6 | Coal | Yellow | black, yellow number |
| 7 | Orange | Ink | orange, black number |
| 8 | Pink | Ink | pink, black number |

- 6 is Coal, not Ink, so the cloth never merges with the Ink outline.
- On the race sprite the number is drawn from the small font in the tack layer's trim slot, so the layer stays at Ink, cloth and number.
- Every saddlecloth box on a Navy fill (strip 12x10, card and result 10x10) gets a 1 px Ash border, so 3 and 6 read on Navy. The number is centered in the small font. Edge markers sit on the track and get an Ink outline instead.
- Risks to check by eye: 7 Orange on a chestnut, 1 Red on a bay, 6 Coal on dark coats. The cloth's Ink outline is the defense.
- Pink: 8 keeps Pink, as the convention has it, and Pink stays the placeholder color. They never look alike. A saddlecloth is always one solid fill with a number. A placeholder is always a checker of 2x2 px Pink and Ink cells. No accepted art uses a Pink and Ink checker, and no placeholder ships.
- M1 silks: a body color and a cap color per horse from the 18, in `src/data/cardLook.json`, no pattern, so the jacket is solid. No two horses on a card share a body color, and the loader rejects a card that does. M1 results show the 10x10 saddlecloth box. The 16x16 silks line above is unchanged and applies once 16x16 silks exist (M9).
- Jockeys carry a crop. The urging animation is a hand ride, never a strike on the horse. (guess)

## Race view

Layout. The M1 pixel placement is in docs/specs/m1-race-day.md 4.3, and the designer owns it. It follows these rules:

- Top 16px: the announcer bar (see HUD, UI frame and font). The race name lives on the card and in the winner's circle, the running time in the bottom HUD.
- Sky and parallax: sky bands (fixed), far layer (hills, skyline), mid layer (infield, trees, tote board). Far scrolls slowest, mid faster, track at full speed.
- No foreground layer passes over the horses.
- Mid-layer zone art (grandstand, infield, barns) is opaque from its ground line down to y87, so no gap shows between the far layer and the far rail.
- A mid-layer tile with a one-off landmark (the infield flagpole, later a barn door or the bugler's stand) is placed once per zone. The rest of the zone repeats a 16 px slice of the same tile that has no landmark and tiles seamlessly. The landmark sits outside that slice. Infield: the slice is columns 0-15, and the pole and flag sit in columns 16-31.
- Flags and pennants are generic. No national or state flag, which would carry a meaning the game does not intend, and no real track's or club's flag.
- Far rail, then the track band, then the near rail. Rails are Bone. Furlong poles and the wire post stand on the far rail, which is the inside rail as at a US track, and draw behind the horses.
- Paths sit 4px apart vertically, so the cap and shoulders of the horse one path inside always show. Inner paths draw first.
- Camera is side-on and favors the player's horse: the leader at screen x200 while yours is close enough, yours held at screen x56 when it is not, handing over to the leaders at the 1/16 pole. The exact rule is spec 3.5.
- Edge marker for a horse off screen: 8x9 at the screen edge, at the horse's lane height, never over the leading pack. A 7x9 box with a full 1 px Ink outline (x0-6 pointing right), fill 5x7 at x1-5 y1-7, the number in the small font at x2-4 y2-6 in its number color, and a 1 px Ink tip at x7 y4 on the pointing side. Flip it for the left edge. (Was 8x8: an 8-row box leaves 6 fill rows, so an Ink number touches the outline, and has no center row for the tip.)
- The player's horse has a small Yellow arrow above the cap, on by default.
- Starting gate (`art.race.gate`, 40x88, 2 frames): drawn behind the horses, so every horse shows at the start. Columns x0-31 are the stalls and header, x32-39 the front doors, standing just ahead of the noses. Gate column x31 sits on the start line, top at screen y64. Closed: the door column filled. Open: the column clear except its two end posts, the far end (above the field) and the near end (below it). Slate, Ash and Bone. (colors guess) The gate is scenery behind the horses and, like a background tile, takes no Ink outline, so it never competes with the horses' outlines. Poles keep theirs because they are thin.
- Furlong poles: Bone posts with one solid colored band, not stripes. The Bone post is the "white" half. At 2 px wide, stripes would read as dither. Band colors come from data: quarter poles Red, eighth poles Emerald, sixteenth poles Coal (black, but Coal, not Ink, so the band never merges with the Ink outline, as with saddlecloth 6). Source: Kentucky 810 KAR 2:070 Section 6(1), https://apps.legislature.ky.gov/law/kar/titles/810/002/070/, requires red and white quarter poles, green and white eighth poles, and black and white sixteenth poles (looked up by the artist on 2026-11-12, not reopened by art-director).
- Track surface tiles per going: fast and good dirt use Dirt and Dirt Shade, sloppy and muddy use Dirt Shade and Mud with Sky Pale glints. Firm turf uses Turf and Grass in mowing stripes, yielding uses Turf and Pine. Synthetic uses Synthetic and Synthetic Light.
- Hoof kick is 1 to 2 pixel clods in Dirt Shade or Mud, as sprites on the grid.
- Mini map: a top-down oval in the bottom HUD. The oval band is 4 px wide in Dirt Shade on the Navy fill, so dots pushed out by lane stay on it. Each horse is a 2x2 dot in its saddlecloth color. The player's horse is a 3x3 dot with a Yellow ring. No blinking.
- Running order strip: one 12x10 box per starter in saddlecloth color with the number in the small font (see Jockeys and silks for the border).
- Photo-finish still: a 112x88 crop of the wire frame (race-view rows y77-164, from 96 px behind the wire to 16 px past it), shown at 2x as 224x176 inside a 240x192 framed panel at x8-247, y8-199. Everything but the horses and the wire becomes vertical Mist and Ash streaks (`art.photo.bg.streaks`, a 16x16 tile at 1x, doubled with the photo), like a strip camera. The finish line is 1 px Bone in the crop, so 2 px on screen. No HUD inside the photo: when your horse is in the crop, the 7x4 Yellow arrow sits at 1x above the panel, y3-6, centered over your horse's cap. Captions sit below the panel at 1x. This is the one allowed exception to mixed pixel density, because it reads as a photograph.
  - Settled 2026-11-13. Horizontal positions are the wire frame's, exactly as the sim gives them. Vertical placement is the photo's own, as if from a raised camera. Lanes sit 8 px apart in crop space (16 px on screen), not 4. The block of occupied lanes is centered in the 88 crop rows: top of the first occupied lane = floor((88 - (8 x (last lane - first lane) + 24)) / 2). Inner lanes still draw first. With all 8 lanes the block is 80 rows, so it always fits. Why: at 4 px, three horses within a neck stack into one shape, and the photo cannot answer "did mine get there". At 8 px, each nose sits at its own height under its own cap.
  - The wire is 1 px Bone with 1 px Ash on each side in crop space (2, 2 and 2 px on screen), drawn behind the horses. Bone alone on Mist is too faint for the most important line in the picture. Ink would merge with a nose's Ink outline.
  - Behind the panel, the race view stays frozen at the wire frame, with the crowd and flag stopped, and the bottom HUD box holds the caption. The photo reads as a print laid on the moment it was taken.

## Overworld and menus

- Top-down 16x16 tile world. People are 16x24 with a slightly big head. That is where the humor lives.
- A person is one sprite with 3 opaque colors: Ink (outline, hair, hat or dark clothes), a skin tone, and one clothing color. Each material is one flat tone. There is no slot for a shade, so where two parts of one color meet (an arm over a coat), a 1 px Ink line parts them. This is the one exception to "interior edges use the shade color", and it holds for people only. Shading for people waits for layered people, as with horses.
- Faces are round and friendly. In profile, the face's front edge curves out and back over 4 to 5 rows, and the nose is a 1 px bump with the same edge 1 px behind it above and below. No hooked or pointed nose, no edge-line mouth that reads as the underside of a nose, no big moustache. Humor comes from props, poses and words, not from a caricatured face.
- Scale beside race-size horses: a person stands 22 px (rows 2-23 of the 16x24 frame), so the shoulders land near the horse's withers and the big head rides above them.
- Kentucky plank fences are Ink or Bone. Barns use Ink, Bone, Maroon trim, Pine roofs. (guess)
- Night (foaling at 2 a.m.) is a remap toward Navy, Coal and Slate.

## HUD, UI frame and font

- Text boxes are built from 8x8 frame tiles: Bone outer line, Ash inner line, Navy fill. Corners are their own tiles.
- Dialog box: full width, 3 lines of text, bottom of screen.
- Announcer bar (race view): y0-15, Navy fill y0-14 and a 1 px Ash line at y15. It is a HUD strip, not a text box, so it has no frame tiles (16 px cannot hold frame tiles and a line of text). One line of Bone text, cell rows y4-11, from x4.
- Cursor: a small Yellow horseshoe.
- Icons in a text row keep the text's spacing. The horseshoe cursor uses all 8 columns of its cell, so the label after it starts 4 px past the cell (cursor x8-15, label x20). The "yours" marker (`art.ui.marker.yours`) is drawn like a glyph, in columns 0-6 and rows 0-6 with column 7 and row 7 blank, so it can sit in the cell right before the text and share its baseline. The marker never moves. Only the cursor bobs, which tells the two apart.
- When the small font shares a line with the main font, its glyph rows 0-4 sit on the main font's rows 2-6, so both share the baseline.
- Main font (`font.ui.main`): original, drawn by the artist. Pixel bitmap, 8x8 cell, monospaced at 8 px advance, so numerals are tabular and odds and times line up. Glyphs: printable ASCII 32 to 126, all 95. Each glyph uses columns 0-6, column 7 is blank. Capitals and digits use rows 0-6. Descenders may use row 7. A bold cartridge cut: vertical stems 2 px, horizontal strokes 1 px, most capitals, digits and lowercase 6 px wide (columns 0-5), wide letters (M, W, m, w) up to 7. Drawn fresh, not traced from any game's font.
- Small font (`font.ui.small`): original, drawn by the artist. 4x6 cell, monospaced at 4 px advance, each glyph 3x5 in columns 0-2 and rows 0-4. Glyphs: `0 1 2 3 4 5 6 7 8 9 : . / # -` and space, 16 in all. No letters. For saddlecloth numbers (strip, boxes, edge markers, the race sprite), splits, the seed, the mini map and the tote board.
- All text uses Phaser BitmapText. No system fonts, no anti-aliased canvas text.
- No text baked into images, except the game logo. Signs, banners and the tote board take text from data, so it can change and is never gibberish.
- Money up is Emerald with a plus sign, money down is Red with a minus sign. Color is never the only signal.
- A horse name is 18 characters max, which is 144px in the main font.

## Tone

Warm, a little funny, respectful of the animals and the sport.

- Humor comes from people, farm animals and dialogue: a barn cat asleep on the tack trunk, a goat that keeps a nervous colt company, a groom who talks too much. Never at a horse's expense.
- Injuries are never shown graphically. No falls, no blood, no limping animation, no screens around a horse. A horse that is pulled up eases to a walk and leaves the frame. A layup shows the horse in its stall with standing wraps and a calm vet visit.
- The vet icon is a stethoscope, not a red cross. The red cross emblem is legally protected.

## Charm

Charm comes from a world busy with its own small business, a race day with ceremony, and people and words with a voice. It never comes from making a horse cute. NES games did this with slow 2-frame loops on a tight budget, and this game does the same. Every item stays on the grid, in master palette colors, at 3 opaque colors per layer.

Race day (M1):

- Orders (paddock) screen: the trainer, 16x24, stands beside your horse with a 2-frame idle, lifting a coffee cup (cup down 1.5 s, up 0.5 s, in data), so the orders come from a person, not a form. Your horse stays on its stand frame with the jockey up. No tail swish in M1, so the trainer carries the screen. The paddock strip (y144-191) has three tile rows. The fence row is on top, y144-159: a Turf band on rows 0-6 (the hedge beyond the paddock, like the infield hedge), then Grass with the two-plank Bone and Mist fence. Plain lawn fills y160-191, where the figures stand clear of every plank. The darker far band and the fence above the heads give the strip its depth. No cast shadows, because race-view horses have none.
- Card and Orders screens: horse blurbs and the trainer's lines are short copy from data with some personality, so the screens have a voice.
- Card and Orders screens: the horseshoe cursor bobs 1px on a slow 2-frame loop, 0.5 s a frame, so the screen never looks frozen while you decide.
- Post parade: the field walks by on the 2-frame walk in post order behind one outrider on a pony, left to right on the outside path, 5 s, every race, Enter skips, so the race opens with a procession. (To check against Churchill's actual post parade: direction, and whether each runner has a pony escort. If it runs right to left, flip the sprites, which is allowed.)
- Call to the post: a 16x24 bugler on the mid layer raises the horn while `sfx.race.call_to_post` plays (original or public domain only), so the player knows the start is next.
- Gate: the field stands still, then the doors open in one 2-frame swap with `sfx.race.gate_open`, so the start lands on one beat.
- Crowd: the grandstand is a mid-layer tile strip that swaps 2 frames (hats and arms up), 1 swap a second early and 4 a second from the eighth pole, so the stretch feels louder without touching the track. Neighboring tiles run a frame apart, so the stand never pulses as one block. The strip counts as one ambient thing.
  - `art.race.bg.mid.crowd`: a 16x16 tile, top at screen y64, figures 3x6 in two rows (back row tile rows 1-6, front row 7-12, offset 2 px), transparent between them so the seats show. Colors: Bone, Sky and Tan. No Red: a Red and Bone crowd is the strongest contrast above the track and fights the silks and saddlecloth 1. Every other tile is flipped (flipX when floor(worldX / 16) is odd, as with the rails), so the pattern repeats every 32 px, not 16.
  - The crowd strip is its own layer over the grandstand and counts as its own tile for the 4-color rule, the way horse layers do (approved item 1). Open for Joseph: this extends "a background tile uses at most 4 colors" to a stacked background layer. Without it the crowd cannot sit on the stand at all.
- Ambient set per camera zone, inside the cap: stretch, the crowd strip and the infield flag; turns, the flag and one pass of a pair of birds on the far layer; backstretch, the barns (still) and the flag. Flag and birds stop at the eighth pole. The flag swaps every 0.4 s, the birds flap every 0.3 s. (rates guess)
- Announcer: one short call per pole in the announcer bar, from data, so the race has a voice that also tells you where you are. Before the eighth pole a call types out at 60 characters a second, whole characters, no cursor. From the eighth pole on, calls cut in whole, so only the horses and the crowd move in the stretch.
- The wire: the photo-finish panel steps in by whole 8px moves with a shutter click, so a close finish gets its moment.
- Winner: after the wire hold, a staged beat. The winner alone, frame at screen x112-143 in its lane at the wire, the background slowing by whole pixels from its speed at the wire to a walk, gallop frames giving way to walk frames. The winning jockey stands in the irons and raises a fist, never the crop, so the win reads at a glance. All jockey layers get the extra frame to stay in lockstep. At 32x24 "stands in the irons" means an upright torso, straighter legs than at the walk and a cap with no peak, 1 px above the walk cap. It does not mean taller, because the crouched cap already touches the frame top. The raised arm is a sleeve, not a line: 3 px wide, Ink sides around 1 px of the silks body color, ending in a 3x2 Ink fist, with 1 px of daylight between it and the cap. A 2 px all-Ink arm reads as a raised stick, which is a crop.
- Result screen: a winner's circle picture with the winner standing, the groom at its head and the owner beside it, so the win is a moment and not a table. A tradition such as the garland of roses is switched on from data, drawn in Red, Pine and Gold. (which race carries which tradition is to check) Off in M1: the race is fictional and the data has no tradition flag.
- Result screen: margins are in racing words from data (nose, head, neck) beside the full silks, so it reads like a chart.

Later screens (guess):

- Farm: the barn cat on the tack trunk breathes in a 2-frame loop and the goat follows the colt it minds, so the barn is lived in.

Cap, so charm never becomes clutter:

- While the field is running, at most 3 ambient moving things on screen at once, not counting horses, hoof kick and the HUD.
- Ambient motion lives on the far and mid layers only. Nothing charming draws on the track band or rails, or covers the leading pack or the player's horse, and nothing pulls the eye away from them.
- From the eighth pole to the wire only the horses and the crowd strip move.
- Ceremony (post parade, call to the post, gate, winner) happens before the start or after the wire, never mid-race.
- Ambient loops swap at most 4 times a second and never flash Bone on Ink, so nothing strobes. Rates are in wall time, so 4x playback does not speed them up.

Charm test: watch 10 seconds at gameplay speed next to the reference. If you cannot name one small thing that made it feel alive and say its job, it is flat. If your eye went to it before the leaders or your horse, it is clutter.

## Do

- Pick colors by palette name, never by eye.
- Check art in context: in the scene, at gameplay speed, next to the reference asset. The first accepted asset of each kind becomes the reference.
- Reuse palette colors across materials.
- Keep sprite layers in lockstep: same size, frames and anchor.
- Draw horses from reference of real thoroughbreds in motion.
- Test silks and UI in grayscale.

## Do not

- Do not add a fourth opaque color to a layer "just for this one".
- Do not animate the field in sync.
- Do not shrink a big sprite to make a small one. Draw the small one.
- Do not put UI over the leading pack.
- Do not use any color that is not in the master palette, including in placeholders.
- Do not make a horse the joke. A horse only does real horse things (walk, gallop, ear flick, tail swish, head toss), and no screen shake or full-screen flash ever lands on the field. (guess)

## Banned looks

Any of these is a reject, whatever else is good about the asset.

- Mixed pixel density on one screen (the photo-finish panel is the only exception).
- Anti-aliased edges, soft shadows, glow, bloom, blur, translucent overlays.
- Smooth gradients, or dither used as a ramp.
- Rotated or non-integer-scaled sprites, and sub-pixel shimmer.
- Pillow shading (dark at every edge, light in the middle).
- High-color "modern indie pixel" with soft lighting and 100+ colors.
- Cartoon or chibi horses, horses with human faces, wrong leg joints.
- Cute-ified horses: emote icons over a horse (hearts, sweat drops, music notes), blush marks, sparkles, squash and stretch.
- Anime horse-girls or any look borrowed from a reference game.
- Generic fantasy stock: swords, slimes, crystals, castles.
- Machine-made tells: an uneven pixel grid, smeared details, extra or missing legs, gibberish text.
- Real brand logos, sponsor marks, real track logos, real owners' registered silks, real jockeys' likenesses.
- Graphic injury of any kind.

## Named art and audio slots

Every art and audio hook goes through a named slot in data, so placeholders work first and final art drops in later.

- Slot id format: `<kind>.<area>.<subject>[.<part>][.<variant>]`
- `kind` is one of `art`, `font`, `sfx`, `music`.
- Lowercase, segments split by dots, words inside a segment split by underscores.
- Examples: `art.race.horse.body`, `art.race.jockey.cap`, `art.ui.frame.dialog`, `art.track.dirt.sloppy`, `font.ui.main`, `sfx.race.gate_open`, `music.farm.morning`.
- Ids never contain file names or extensions. The slot entry in data holds the file, frame size, frame count, anchor, nose x for race frames, and whether it is recolorable.
- A placeholder is a Pink and Ink checker with the slot id in the small font, so it can never ship by accident. An audio placeholder may be silence.
- Placeholder race: before sprites are approved, the race-day screens use flat stand-ins that still follow every rule here, so the first build already reads as this game. It must have master palette sky bands, the track surface for the going, Bone rails and furlong poles; each horse as a flat 32x24 shape in a coat color with the Ink outline, a jacket block in its silks body color, a cap and its saddlecloth number, on a 2-frame cycle advanced by distance (see Stand-in race horse); the real UI frame tiles, the Yellow arrow and the horseshoe cursor; the original 8x8 and 4x6 fonts, drawn by the artist, no third-party font; real copy from data; and at least the gate opening and the wire.
- The Pink and Ink checker still applies to every slot with no stand-in, every rejected asset, and everything outside the race-day screens.
- A stand-in sits in a slot marked as a placeholder in data, gets an ASSETS.md row marked stand-in, and while any placeholder is on screen an 8x8 Pink and Ink checker tag shows in the HUD corner. The build must refuse to ship a placeholder slot. The engineer picks how and logs it in docs/DECISIONS.md.
- Open for Joseph (M1 answer 4): the slot id cannot print on most placeholders. The small font has no letters, and an 8x8 slot is narrower than any id. The designer's proposal: the checker alone, plus the HUD tag and a console list of placeholder slots. The checker line above is unchanged until Joseph decides. P0 builds the checker, the tag and the console list, which it needs either way.
- Ids are stable. A rename updates every reference in the same change.

## Asset intake checklist

art-director checks every item before an asset counts as done. A missing item is a REVISE, a missing ASSETS.md row is a REJECT.

1. Row in docs/ASSETS.md with every column filled: name, file, source URL (or "original"), license, date added, what was changed, AI used and how.
2. License read on the source page itself. CC0 preferred. Kenney first.
3. File path: the slot id with its dots as slashes, under `public/assets/`, plus the extension. Lowercase, underscores inside a segment. Example: `art.race.horse.body.gallop` is `public/assets/art/race/horse/body/gallop.png`. Frame size, frame count and anchor live in the slot data, not in the file name. The engineer loads by slot path, so the path and the id never disagree.
4. Audio files: the same rule. Example: `sfx.race.gate_open` is `public/assets/sfx/race/gate_open.<ext>`. The format is the engineer's call, logged in docs/DECISIONS.md.
5. Authored at 1x, never upscaled in the file. Frame size matches the grid rules. Frames sit in one horizontal row, left to right, no padding.
6. Only master palette colors. At most 3 opaque colors per sprite layer, 4 per tile. Alpha is 0 or 255 only. ICC and gamma chunks stripped so browsers do not shift colors.
7. Recolorable layers use the key colors (Ink, Ash, Slate). All layers of a set share size, frame count, frame order and anchor.
8. A slot id exists in data and points to the file.
9. Checked in context: 20-horse field at speed on all three surfaces for race art, next to the reference asset.
10. Any third-party asset (Kenney included) is remapped to the master palette and regridded to 16x16 before use, and the row says so.
11. If a script drew it, the script is committed in `scripts/art/` and the ASSETS.md row names it. One script may draw many assets. If an editor drew it, the editable source is committed under `art-src/` at the same path as the PNG, with the editor's extension (for example `art-src/art/race/gate.aseprite`), never under `public/`, which ships as is.
12. AI-generated images may be used as rough reference or silhouette studies only. Final pixels are placed by hand or by a committed script, and the AI use is logged. (approved 2026-11-12)
13. Nothing from the banned looks list.

## Originality

No asset, name, text, UI layout or character from the reference games in the brief. Real races, tracks and sales appear by name only, from data, with no real logos or trademarks, and no venue's signature architecture: the grandstand is a generic stand, with no twin spires or anything close to them. Horses, jockeys, trainers, stables and NPCs are fictional, and so are their silks.
