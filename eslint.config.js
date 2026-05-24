// ESLint 9 flat config — migrated from .eslintrc.cjs in Phase 0 follow-up.
// Why flat config: ESLint 9 deprecated the legacy .eslintrc.* loader, so the
// old config silently produced 0 lint output. See issue #9 Q4.
//
// Plugin-version notes (these matter, so leaving them in source for the next
// agent who touches this file):
//   - eslint-plugin-react v7.37 ships configs.flat.recommended (flat-ready).
//   - eslint-plugin-react-hooks v5.2+ ships configs["recommended-latest"]
//     which bundles its own plugin object — no fixupPluginRules needed.
//   - For @typescript-eslint, we spread tsPlugin.configs.recommended.rules
//     INSIDE the TS-files block (not at top level) so the TS rules don't
//     accidentally apply to scripts/*.mjs.

import js from "@eslint/js";
import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import reactPlugin from "eslint-plugin-react";
import reactHooksPlugin from "eslint-plugin-react-hooks";
import prettierConfig from "eslint-config-prettier";
import globals from "globals";

export default [
  // Ignores — flat config equivalent of the old ignorePatterns.
  {
    ignores: [
      "dist-electron/**",
      "dist-web/**",
      "node_modules/**",
      "*.config.ts",
    ],
  },

  // Baseline eslint:recommended for everything we lint.
  js.configs.recommended,

  // React recommended (flat) — applies to JSX-bearing files; harmless on
  // pure .ts files because the rules only fire when React APIs are present.
  reactPlugin.configs.flat.recommended,

  // React version (needed at the top level so eslint-plugin-react stops
  // warning "React version not specified").
  {
    settings: {
      react: { version: "18.3" },
    },
  },

  // React Hooks recommended (flat-ready in v5.2+).
  reactHooksPlugin.configs["recommended-latest"],

  // TypeScript-specific block. Parser, plugin, and the recommended rule set
  // are all scoped to *.ts / *.tsx so they don't bleed onto scripts/*.mjs.
  {
    files: ["src/**/*.{ts,tsx}", "tests/**/*.{ts,tsx}"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: "module",
        ecmaFeatures: { jsx: true },
      },
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.es2022,
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
    },
    settings: {
      react: { version: "18.3" },
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      "react/react-in-jsx-scope": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
      // Phase 0 platform stubs (src/platform/{electron,web}.ts) have
      // intentionally yield-less `async *stream()` generators. They MUST
      // remain generators to satisfy the AsyncIterable<AIChunk> contract
      // in the Platform interface; Phase 9 fills in the actual yields.
      // Re-enable this rule once Phase 9 wires real streaming.
      "require-yield": "off",
    },
  },

  // Renderer-only globals — Vite's `define` injects __PLATFORM__ at build
  // time (see vite.config.{electron,web}.ts). Without declaring it here,
  // no-undef fires on src/renderer/main.tsx.
  {
    files: ["src/renderer/**/*.{ts,tsx}"],
    languageOptions: {
      globals: {
        __PLATFORM__: "readonly",
      },
    },
  },

  // Plain Node scripts (scripts/*.mjs) — no TS, no JSX, Node globals only.
  {
    files: ["scripts/**/*.mjs"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...globals.node,
      },
    },
  },

  // Prettier LAST — strips stylistic rules that would conflict with the
  // formatter. Anything stylistic stays Prettier's job.
  prettierConfig,
];
