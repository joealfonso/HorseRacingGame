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

export default tseslint.config(
  { ignores: ['dist/', 'coverage/', 'node_modules/', '_archive/'] },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ['src/sim/**'],
    rules: {
      'no-restricted-imports': ['error', PHASER_BAN],
      // no-restricted-imports does not see import('phaser').
      'no-restricted-syntax': [
        'error',
        {
          selector: "ImportExpression[source.value=/^phaser(\\/.*)?$/]",
          message: 'src/sim/ must not import Phaser. Keep the sim headless.',
        },
      ],
    },
  },
);
