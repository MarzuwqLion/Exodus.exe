import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';
import globals from 'globals';
import prettier from 'eslint-config-prettier';

/** Folders that make up the headless simulation layer. They must never touch Three.js or the DOM renderer. */
const headless = [
  'src/core/**/*.ts',
  'src/sim/**/*.ts',
  'src/run/**/*.ts',
  'src/content/**/*.ts',
  'src/bots/**/*.ts',
];

export default defineConfig(
  { ignores: ['dist/**', 'node_modules/**', 'coverage/**', 'qa/**', '.claude/**'] },
  js.configs.recommended,
  tseslint.configs.strict,
  {
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'error',
      'no-console': ['error', { allow: ['warn', 'error', 'info'] }],
      eqeqeq: ['error', 'always'],
    },
  },
  {
    files: headless,
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['three', 'three/*'],
              message: 'The simulation layer never imports Three.js (spec 3.2).',
            },
            {
              group: [
                '**/render/**',
                '**/models/**',
                '**/anim/**',
                '**/ui/**',
                '**/audio/**',
                '**/scenes/**',
              ],
              message: 'Headless layers must not import rendering, UI, audio, or scenes.',
            },
          ],
        },
      ],
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'Use the seeded RNG (src/core/rng.ts).' },
      ],
    },
  },
  {
    files: ['tools/**/*.ts', 'tests/**/*.ts'],
    rules: { 'no-console': 'off' },
  },
  prettier,
);
