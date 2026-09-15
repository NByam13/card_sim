// Flat ESLint config. Mirrors PonyRec's rules: lint stays syntactic and fast, and
// full type-checking is owned by `npm run type-check` (tsc), keeping the two
// concerns separate.
//
// Formatting runs *through* ESLint via eslint-plugin-prettier, so `npm run lint`
// is the single quality gate for JS/TS: no separate `prettier --check` pass to
// drift out of sync with, and no chance of the two tools disagreeing. Because
// ESLint only sees TS/JS, this deliberately leaves Markdown, JSON and YAML
// unformatted. PHP formatting belongs to Pint.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';
import prettierRecommended from 'eslint-plugin-prettier/recommended';

export default tseslint.config(
  // Never lint build output, dependencies, or Wayfinder's generated route helpers.
  {
    ignores: [
      'node_modules/**',
      'vendor/**',
      'public/build/**',
      'public/hot',
      'bootstrap/cache/**',
      'bootstrap/ssr/**',
      'resources/js/actions/**',
      'resources/js/routes/**',
      'resources/js/wayfinder/**',
      '**/*.d.ts',
    ],
  },

  // The web app: browser globals and JSX.
  {
    files: ['resources/js/**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      globals: { ...globals.browser },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
  },

  // Root config files run under Node.
  {
    files: ['*.config.ts'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      globals: { ...globals.node },
    },
  },

  // Runs Prettier as the `prettier/prettier` rule AND turns off every core rule
  // that would conflict with it (this preset bundles eslint-config-prettier).
  // Must stay last so its rule-disabling wins.
  prettierRecommended
);
