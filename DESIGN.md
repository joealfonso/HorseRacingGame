# DESIGN.md: Bluegrass Dynasty visual direction

**Status: Draft, waiting on Joseph's approval.** No sprite work starts until he approves it. Drafted by art-director on 2026-11-11 from docs/BRIEF.md. Anything marked (guess) is my call, not Joseph's, and is open to change.

## Waiting on Joseph

1. The 4-colors-per-sprite rule applies per layer, not per composite horse (see Horses).
2. Horses are 32x24, outside the brief's 16x16 or 16x24 character sizes (see Horses).
3. No NES-honest toggle (see NES-honest toggle).
4. The race view shows silks from pattern and colors only. Freehand pixels in the 16x16 editor show in menus and results, not on the race sprite (see Silks).
5. The 42-color palette below.

## Vision

A warm Kentucky morning on an NES cartridge: big calm shapes, a small honest palette, and horses drawn like the athletes they are.

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

## Jockeys and silks

- Silks are designed at 16x16 with a pattern (stripes, hoops, diamonds, quartered, sash, or solid) and 2 to 3 colors: body, pattern, cap. The cap may repeat body or pattern.
- Silks colors are the 18 in the value bands list.
- Body and pattern colors must come from different value bands, so silks read in grayscale and for colorblind players.
- On the race sprite the jacket is about 7x6 pixels. It is drawn from a fixed pattern mask for each pattern type plus the colors, not by shrinking the 16x16 design. The body color covers at least half the jacket so it carries at speed.
- If the editor allows freehand pixels, they show in the silks designer, owner card and results, not in the race view. (guess, Joseph to approve)
- Results show the full 16x16 silks beside each finisher.
- 20 starters and 18 colors means body colors can repeat in a field. No two stables in one race may share the same body color, pattern color and pattern. Rival and generated silks are picked to avoid clashes. The player is warned on a clash.
- Two horses from the same stable wear the same jacket and are told apart by cap color, as in real racing.
- Saddlecloth color follows the program number, modeled on the US saddlecloth convention. The 1 to 20 color list lives in data and must be checked against a primary source before it ships. (guess)
- Jockeys carry a crop. The urging animation is a hand ride, never a strike on the horse. (guess)

## Race view

Layout (guess, the designer owns final placement):

- Top 16px: HUD bar with race name, furlong call and running time.
- Sky and parallax: sky bands (fixed), far layer (hills, skyline), mid layer (infield, trees, tote board). Far scrolls slowest, mid faster, track at full speed.
- No foreground layer passes over the horses.
- Far rail, then the track band, then the near rail with furlong poles. Rails are Bone.
- Paths sit 4px apart vertically, so the cap and shoulders of the horse one path inside always show (guess). Inner paths draw first.
- Camera is side-on and tracks the leader. If the player's horse falls off screen, an edge arrow shows where it is. (guess, designer to confirm)
- The player's horse has a small Yellow arrow above the cap, on by default.
- Furlong poles: Bone posts with a colored band. Band colors come from data and follow the US quarter, eighth and sixteenth pole convention once checked against a primary source. (guess)
- Track surface tiles per going: fast and good dirt use Dirt and Dirt Shade, sloppy and muddy use Dirt Shade and Mud with Sky Pale glints. Firm turf uses Turf and Grass in mowing stripes, yielding uses Turf and Pine. Synthetic uses Synthetic and Synthetic Light.
- Hoof kick is 1 to 2 pixel clods in Dirt Shade or Mud, as sprites on the grid.
- Mini map: a top-down oval in the bottom HUD. Each horse is a 2x2 dot in its saddlecloth color. The player's horse is a 3x3 dot with a Yellow ring. No blinking.
- Running order strip: one box per starter in saddlecloth color with the number in the small font.
- Photo-finish still: the race frame at the wire, cropped to 128x112 and shown at 2x inside a framed panel. The background is replaced by vertical Mist and Ash streaks, like a strip camera, and the finish line is a 1px Bone line. Labels sit outside the photo at 1x. This is the one allowed exception to mixed pixel density, because it reads as a photograph. (guess)

## Overworld and menus

- Top-down 16x16 tile world. People are 16x24 with a slightly big head. That is where the humor lives.
- Kentucky plank fences are Ink or Bone. Barns use Ink, Bone, Maroon trim, Pine roofs. (guess)
- Night (foaling at 2 a.m.) is a remap toward Navy, Coal and Slate.

## HUD, UI frame and font

- Text boxes are built from 8x8 frame tiles: Bone outer line, Ash inner line, Navy fill. Corners are their own tiles.
- Dialog box: full width, 3 lines of text, bottom of screen.
- Cursor: a small Yellow horseshoe.
- Main font: pixel bitmap, 8x8 cell, upper and lower case, tabular numerals so odds and times line up on the tote board.
- Small font: 4x6 cell, numerals and a few symbols, for the running order strip, mini map and tote board.
- All text uses Phaser BitmapText. No system fonts, no anti-aliased canvas text.
- No text baked into images, except the game logo. Signs, banners and the tote board take text from data, so it can change and is never gibberish.
- Money up is Emerald with a plus sign, money down is Red with a minus sign. Color is never the only signal.
- A horse name is 18 characters max, which is 144px in the main font.

## Tone

Warm, a little funny, respectful of the animals and the sport.

- Humor comes from people, farm animals and dialogue: a barn cat asleep on the tack trunk, a goat that keeps a nervous colt company, a groom who talks too much. Never at a horse's expense.
- Injuries are never shown graphically. No falls, no blood, no limping animation, no screens around a horse. A horse that is pulled up eases to a walk and leaves the frame. A layup shows the horse in its stall with standing wraps and a calm vet visit.
- The vet icon is a stethoscope, not a red cross. The red cross emblem is legally protected.

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

## Banned looks

Any of these is a reject, whatever else is good about the asset.

- Mixed pixel density on one screen (the photo-finish panel is the only exception).
- Anti-aliased edges, soft shadows, glow, bloom, blur, translucent overlays.
- Smooth gradients, or dither used as a ramp.
- Rotated or non-integer-scaled sprites, and sub-pixel shimmer.
- Pillow shading (dark at every edge, light in the middle).
- High-color "modern indie pixel" with soft lighting and 100+ colors.
- Cartoon or chibi horses, horses with human faces, wrong leg joints.
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
- Ids are stable. A rename updates every reference in the same change.

## Asset intake checklist

art-director checks every item before an asset counts as done. A missing item is a REVISE, a missing ASSETS.md row is a REJECT.

1. Row in docs/ASSETS.md with every column filled: name, file, source URL (or "original"), license, date added, what was changed, AI used and how.
2. License read on the source page itself. CC0 preferred. Kenney first.
3. File name: `assets/art/<area>/<area>_<subject>_<layer>_<anim>_<w>x<h>.png`, lowercase snake_case. Drop parts that do not apply. Example: `assets/art/race/race_horse_body_gallop_32x24.png`.
4. Audio files: `assets/audio/<kind>/<area>_<subject>_<event>.<ext>`. The format is the engineer's call, logged in docs/DECISIONS.md.
5. Authored at 1x, never upscaled in the file. Frame size matches the grid rules. Frames sit in one horizontal row, left to right, no padding.
6. Only master palette colors. At most 3 opaque colors per sprite layer, 4 per tile. Alpha is 0 or 255 only. ICC and gamma chunks stripped so browsers do not shift colors.
7. Recolorable layers use the key colors (Ink, Ash, Slate). All layers of a set share size, frame count, frame order and anchor.
8. A slot id exists in data and points to the file.
9. Checked in context: 20-horse field at speed on all three surfaces for race art, next to the reference asset.
10. Any third-party asset (Kenney included) is remapped to the master palette and regridded to 16x16 before use, and the row says so.
11. If a script drew it, the script is committed next to the output. If an editor drew it, the editable source sits next to the PNG with the same base name.
12. AI-generated images may be used as rough reference or silhouette studies only. Final pixels are placed by hand or by a committed script, and the AI use is logged. (guess, Joseph to approve)
13. Nothing from the banned looks list.

## Originality

No asset, name, text, UI layout or character from the reference games in the brief. Real races, tracks and sales appear by name only, from data, with no real logos or trademarks. Horses, jockeys, trainers, stables and NPCs are fictional, and so are their silks.
