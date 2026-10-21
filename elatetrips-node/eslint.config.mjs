import parser from '@typescript-eslint/parser';
import typescript from '@typescript-eslint/eslint-plugin';

// TypeScript's compiler owns undefined names/types; these syntax rules also run
// on tests and declarations, without loading or executing application modules.
export default [
  {
    files: ['src/**/*.ts'],
    linterOptions: { noInlineConfig: true, reportUnusedDisableDirectives: 'error' },
    languageOptions: { parser, parserOptions: { ecmaVersion: 2021, sourceType: 'module' } },
    plugins: { '@typescript-eslint': typescript },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { args: 'after-used', caughtErrors: 'all' }],
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/no-duplicate-enum-values': 'error',
      'no-var': 'error',
      'prefer-const': 'error',
      eqeqeq: ['error', 'always'],
    },
  },
];
