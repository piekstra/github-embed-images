export default [
  {
    files: ['**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        console: 'readonly',
        process: 'readonly',
        FormData: 'readonly',
        Blob: 'readonly',
        atob: 'readonly',
        fetch: 'readonly',
        window: 'readonly',
        document: 'readonly',
        Uint8Array: 'readonly',
        Buffer: 'readonly',
        URL: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-undef': 'error',
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      'semi': ['error', 'always'],
    },
  },
  {
    ignores: ['node_modules/**', 'test/.tmp/**'],
  },
];
