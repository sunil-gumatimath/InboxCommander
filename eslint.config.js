// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default [
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'out/**',
      'assets/**', // built output at repo root
      'content/**', // built output at repo root
      'options/**', // built output at repo root
      'popup/**', // built output at repo root
      'sidepanel/**', // built output at repo root
      'manifest.json', // built output at repo root
      'service-worker-loader.js', // built output at repo root
      'src/assets/icons/**',
      'coverage/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: {
        // Chrome extension APIs — populated by @types/chrome
        chrome: 'readonly',
        console: 'readonly',
        crypto: 'readonly',
        fetch: 'readonly',
        atob: 'readonly',
        btoa: 'readonly',
        TextEncoder: 'readonly',
        TextDecoder: 'readonly',
        Uint8Array: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        document: 'readonly',
        window: 'readonly',
        MutationObserver: 'readonly',
        IntersectionObserver: 'readonly',
        HTMLElement: 'readonly',
        HTMLButtonElement: 'readonly',
        HTMLInputElement: 'readonly',
        HTMLTextAreaElement: 'readonly',
        HTMLAnchorElement: 'readonly',
        Node: 'readonly',
        Element: 'readonly',
        Event: 'readonly',
        MouseEvent: 'readonly',
        Animation: 'readonly',
        URL: 'readonly',
        Response: 'readonly',
        RequestInit: 'readonly',
        Request: 'readonly',
        Headers: 'readonly',
        Promise: 'readonly',
        Date: 'readonly',
        Math: 'readonly',
        JSON: 'readonly',
        Object: 'readonly',
        Array: 'readonly',
        Map: 'readonly',
        Set: 'readonly',
        Error: 'readonly',
        TypeError: 'readonly',
        RegExp: 'readonly',
        String: 'readonly',
        Number: 'readonly',
        Boolean: 'readonly',
        Symbol: 'readonly',
        parseInt: 'readonly',
        parseFloat: 'readonly',
        isFinite: 'readonly',
        isNaN: 'readonly',
        encodeURIComponent: 'readonly',
        decodeURIComponent: 'readonly',
        encodeURI: 'readonly',
        decodeURI: 'readonly',
        alert: 'readonly',
        confirm: 'readonly',
        structuredClone: 'readonly',
        queueMicrotask: 'readonly',
        AbortController: 'readonly',
        AbortSignal: 'readonly',
      },
    },
    rules: {
      // Strictness we want
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'warn', // we'll migrate to 'error' after Phase 4
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      'no-console': ['warn', { allow: ['warn', 'error', 'info', 'log'] }],
      eqeqeq: ['error', 'always'],
      'no-var': 'error',
      'prefer-const': 'error',
      'no-return-assign': 'error',
      'no-throw-literal': 'error',
      // Allow non-null assertions sparingly (we have strict tsconfig catching the rest)
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
  // Loosen rules for content script (runs in Gmail's page context)
  {
    files: ['src/content/**/*.ts'],
    rules: {
      'no-console': 'off',
    },
  },
  // Loosen rules for test files
  {
    files: ['**/*.test.ts', 'tests/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      'no-console': 'off',
    },
  },
  prettier, // must be last — disables formatting rules that conflict with Prettier
];
