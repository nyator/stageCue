import eslint from '@eslint/js'
import prettier from 'eslint-config-prettier'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/out/**', '**/node_modules/**', '**/*.tsbuildinfo'],
  },
  eslint.configs.recommended,
  tseslint.configs.recommended,
  reactHooks.configs.flat.recommended,
  prettier,
  {
    files: ['apps/desktop/src/renderer/**/*.{ts,tsx}'],
    plugins: {
      'react-refresh': reactRefresh,
    },
    rules: {
      'react-refresh/only-export-components': 'warn',
    },
  },
  {
    // Max's classic [js] object: ES5 scripts with Max's own globals.
    files: ['integrations/ableton/device/stagecue-lom.js'],
    languageOptions: {
      ecmaVersion: 5,
      sourceType: 'script',
      globals: {
        autowatch: 'writable',
        inlets: 'writable',
        outlets: 'writable',
        outlet: 'readonly',
        post: 'readonly',
        LiveAPI: 'readonly',
        Task: 'readonly',
      },
    },
    rules: {
      'no-var': 'off',
      'no-unused-vars': ['error', { varsIgnorePattern: '^(bang|notifydeleted)$' }],
      '@typescript-eslint/no-unused-vars': 'off',
    },
  },
  {
    // Node for Max: CommonJS.
    files: ['integrations/ableton/device/stagecue-bridge.js'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: {
        require: 'readonly',
        process: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        WebSocket: 'readonly',
      },
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
)
