// ESLint 9 flat config.
//
// ESLint 8 is end of life, so the lint step was running on an unsupported line.
// `eslint-config-next` still ships eslintrc-style shareable configs, so
// FlatCompat translates them; everything else here is native flat config.

import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FlatCompat } from '@eslint/eslintrc';

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

const config = [
  {
    ignores: ['.next/**', 'node_modules/**', 'out/**', 'build/**', 'next-env.d.ts'],
  },
  ...compat.extends('next/core-web-vitals'),
  {
    // Tests and build scripts are Node programs, not Next pages. They are linted
    // (the old eslintrc excluded them entirely, so nothing checked them) with
    // the Next-specific page rules switched off.
    files: ['scripts/**/*.mjs', 'tests/**/*.ts'],
    rules: {
      '@next/next/no-html-link-for-pages': 'off',
    },
  },
];

export default config;
