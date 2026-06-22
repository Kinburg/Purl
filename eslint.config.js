import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    "rules": {
      "@typescript-eslint/no-explicit-any": "off",
      "no-control-regex": "off",
      // setState inside useEffect is intentional in several places (reset local UI state
      // on prop change, auto-expand on insert). Disabling globally is simpler than
      // scattering eslint-disable comments across unrelated files.
      "react-hooks/set-state-in-effect": "off",
      // False positive: rule treats objects returned from hooks that contain refs as refs
      // themselves, flagging legitimate state/callback access (e.g. dropdown.open) as
      // "ref access during render".
      "react-hooks/refs": "off",
      // False positive: rule flags Date.now() calls inside async event handlers as
      // "impure function during render".
      "react-hooks/purity": "off",
      // Allow exporting constants alongside components (common pattern in Vite projects).
      "react-refresh/only-export-components": ["warn", { "allowConstantExport": true }],
      // Honor the `_`-prefix convention for intentionally-unused params/vars/destructure-drops.
      "@typescript-eslint/no-unused-vars": ["warn", {
        "argsIgnorePattern": "^_",
        "varsIgnorePattern": "^_",
        "caughtErrorsIgnorePattern": "^_",
        "destructuredArrayIgnorePattern": "^_"
      }]
    },
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
  },
])
