import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['packages/**/*.ts', 'client/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', { patterns: ['./*', '../*'] }],
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
);
