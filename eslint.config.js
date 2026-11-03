import tseslint from 'typescript-eslint';
export default tseslint.config(
  { ignores: ['dist', 'dist-e2e', 'node_modules', 'src/icons/icons.ts', 'test-results', 'public/theme-init.js', '.wrangler'] },
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-restricted-properties': ['error', { property: 'innerHTML', message: 'No innerHTML: render with Preact.' }],
      'no-restricted-syntax': ['error', { selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']", message: 'Never inject HTML.' }],
    },
  },
);
