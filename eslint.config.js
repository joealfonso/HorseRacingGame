import js from '@eslint/js';
import tseslint from 'typescript-eslint';

// The sim must run headless, so nothing under src/sim/ may reach Phaser.
// Type imports are banned too: they would still tie the sim's types to Phaser.
const PHASER_BAN = {
  patterns: [
    {
      group: ['phaser', 'phaser/*'],
      message: 'src/sim/ must not import Phaser. Keep the sim headless.',
    },
  ],
};

// no-restricted-imports does not see import('phaser').
const PHASER_DYNAMIC_IMPORT = {
  selector: "ImportExpression[source.value=/^phaser(\\/.*)?$/]",
  message: 'src/sim/ must not import Phaser. Keep the sim headless.',
};

// Same seed, same race: the sim may not read time or outside randomness.
const DETERMINISM = 'The sim must be deterministic. Use the race streams or pass the value in.';
const BANNED_GLOBALS = ['Date', 'performance', 'crypto', 'setTimeout', 'setInterval'];

// JavaScript lets engines approximate these, so results can differ between
// browsers. sqrt, floor, round, abs and the like are exact and stay allowed.
const INEXACT_MATH = [
  'exp', 'expm1', 'log', 'log1p', 'log2', 'log10', 'pow',
  'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'atan2',
  'sinh', 'cosh', 'tanh', 'asinh', 'acosh', 'atanh', 'cbrt', 'hypot',
];
const INEXACT = 'Engines may round this differently. Use exact math under src/sim/.';

export default tseslint.config(
  { ignores: ['dist/', 'coverage/', 'node_modules/', '_archive/'] },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ['src/sim/**'],
    rules: {
      'no-restricted-imports': ['error', PHASER_BAN],
      'no-restricted-syntax': ['error', PHASER_DYNAMIC_IMPORT],
    },
  },
  {
    // Tests are not part of a race and may time things or build inputs freely.
    // They still get the Phaser ban from the block above.
    files: ['src/sim/**'],
    ignores: ['src/sim/**/*.test.ts'],
    rules: {
      // Replaces the block above's options for this rule, so the Phaser selector is repeated.
      'no-restricted-syntax': [
        'error',
        PHASER_DYNAMIC_IMPORT,
        { selector: "BinaryExpression[operator='**']", message: INEXACT },
        { selector: "AssignmentExpression[operator='**=']", message: INEXACT },
      ],
      'no-restricted-globals': ['error', ...BANNED_GLOBALS.map((name) => ({ name, message: DETERMINISM }))],
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: DETERMINISM },
        ...INEXACT_MATH.map((property) => ({ object: 'Math', property, message: INEXACT })),
      ],
    },
  },
);
