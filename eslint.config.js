import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }]
    }
  },
  {
    // The simulation core must stay engine-free and deterministic.
    files: ['src/sim/**/*.ts', 'src/content/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [{ group: ['phaser', 'phaser/*'] }] }],
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'Use the seeded Rng from sim/rng.ts.' },
        { object: 'Date', property: 'now', message: 'Sim time comes from tick count only.' }
      ]
    }
  }
);
