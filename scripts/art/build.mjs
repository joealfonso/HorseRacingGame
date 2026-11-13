// Regenerates every art asset from the scripts in this folder.
// Run: node scripts/art/build.mjs
// Then check: node scripts/art/verify.mjs
import { relative } from 'node:path';
import { REPO } from './png.mjs';
import * as fontMain from './font_main.mjs';
import * as fontSmall from './font_small.mjs';
import * as ui from './ui.mjs';
import * as track from './track.mjs';
import * as horse from './horse.mjs';
import * as mid from './mid.mjs';
import * as photo from './photo.mjs';
import * as paddock from './paddock.mjs';

const written = [fontMain, fontSmall, ui, track, mid, photo, horse, paddock].flatMap((m) => m.build());
for (const p of written) console.log(relative(REPO, p));
console.log(`${written.length} files`);
