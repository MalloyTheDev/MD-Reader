import { defineConfig } from 'eslint/config'
import tseslint from '@electron-toolkit/eslint-config-ts'
import eslintConfigPrettier from '@electron-toolkit/eslint-config-prettier'
import eslintPluginReact from 'eslint-plugin-react'
import eslintPluginReactHooks from 'eslint-plugin-react-hooks'
import eslintPluginReactRefresh from 'eslint-plugin-react-refresh'

export default defineConfig(
  { ignores: ['**/node_modules', '**/dist', '**/out'] },
  tseslint.configs.recommended,
  eslintPluginReact.configs.flat.recommended,
  eslintPluginReact.configs.flat['jsx-runtime'],
  {
    settings: {
      react: {
        version: 'detect'
      }
    }
  },
  {
    files: ['**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': eslintPluginReactHooks,
      'react-refresh': eslintPluginReactRefresh
    },
    rules: {
      ...eslintPluginReactHooks.configs.recommended.rules,
      ...eslintPluginReactRefresh.configs.vite.rules,
      // Dev-only HMR ergonomics rule; several files intentionally co-locate a component with
      // shared helpers/types, so warn rather than error.
      'react-refresh/only-export-components': 'warn',
      // React-Compiler diagnostic rules: this app does NOT use the React Compiler, and these
      // patterns (refs during render for measurement, setState in effects for pagination, local
      // accumulators in pure render helpers, manual memoization) are intentional and correct here.
      // Keep them as advisory warnings; the classic rules-of-hooks / exhaustive-deps stay enforced.
      'react-hooks/immutability': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/set-state-in-render': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
      'react-hooks/use-memo': 'warn'
    }
  },
  eslintConfigPrettier,
  {
    // Project-wide rule tuning (applied last so it wins):
    //  - explicit return types are nice-to-have, not blocking.
    //  - ignore intentionally-unused args/vars prefixed with "_" (e.g. an unused IPC event arg).
    rules: {
      '@typescript-eslint/explicit-function-return-type': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }
      ]
    }
  }
)
