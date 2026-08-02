/**
 * ESLint configuration.
 *
 * The repo had eslint and its plugins in devDependencies and a `lint` script,
 * but no config file — so `npm run lint` failed with "No ESLint configuration
 * found" and nothing was ever actually linted. CI now gates on it, so it needs
 * to exist and it needs to be honest.
 *
 * DELIBERATELY NOT ENABLED: eslint-plugin-prettier.
 *   This codebase aligns things by hand on purpose — the column-aligned object
 *   literals in app.module.ts, the boxed section comments. Turning Prettier
 *   into a lint rule would flag every one of those as an error and the only
 *   ways out are reformatting the whole repo or ignoring CI. eslint-config-
 *   prettier is still extended, which turns OFF stylistic rules that would
 *   conflict with Prettier if you run it manually via `npm run format`.
 *
 * The rules below are the ones that catch actual bugs. Style is left alone.
 */
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'prettier', // must stay last — disables stylistic rules only
  ],
  env: {
    node: true,
    jest: true,
    es2022: true,
  },
  ignorePatterns: [
    'dist/',
    'node_modules/',
    'coverage/',
    'public/',
    '*.js',      // this config file and any stray build scripts
    '*.mjs',     // scripts/smoke-audio.mjs is plain Node, not project TS
  ],
  rules: {
    // ── Off: pervasive in this codebase and not bugs ──────────────────────
    // Provider SDK payloads and Anthropic content blocks are genuinely
    // untyped at the boundary; `any` there is a deliberate choice, not sloppiness.
    '@typescript-eslint/no-explicit-any': 'off',
    // NestJS DI relies on decorator metadata; empty interfaces and non-null
    // assertions on injected members are idiomatic.
    '@typescript-eslint/no-non-null-assertion': 'off',
    '@typescript-eslint/no-empty-interface': 'off',
    // require() is used for CommonJS interop in a few places.
    '@typescript-eslint/no-var-requires': 'off',
    // TypeScript already enforces this and does it better.
    'no-undef': 'off',

    // ── Warn: worth seeing, not worth blocking a deploy ───────────────────
    '@typescript-eslint/no-unused-vars': [
      'warn',
      // A leading underscore is the conventional "yes, I know, it's required
      // by the signature" marker — respect it.
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
    ],
    'no-empty': ['warn', { allowEmptyCatch: true }],

    // ── Error: these are real bugs ────────────────────────────────────────
    // A floating promise is how a write silently doesn't happen. The one
    // intentional fire-and-forget (the summary roll) is marked with `void`,
    // which this rule accepts.
    'no-async-promise-executor': 'error',
    'no-constant-condition': ['error', { checkLoops: false }],
    'no-dupe-keys': 'error',
    'no-unreachable': 'error',
    'no-fallthrough': 'error',
    'require-atomic-updates': 'off', // too many false positives on async/await
  },
};
