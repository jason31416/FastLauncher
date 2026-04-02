import js from '@eslint/js';
import pluginVue from 'eslint-plugin-vue';
import vueParser from 'vue-eslint-parser';

const globals = {
  console: 'readonly',
  process: 'readonly',
  Buffer: 'readonly',
  setTimeout: 'readonly',
  setInterval: 'readonly',
  clearInterval: 'readonly',
  clearTimeout: 'readonly',
  fetch: 'readonly',
  AbortSignal: 'readonly',
  __dirname: 'readonly',
  MAIN_WINDOW_VITE_DEV_SERVER_URL: 'readonly',
  MAIN_WINDOW_VITE_NAME: 'readonly'
};

export default [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
      'no-constant-binary-expression': 'off',
      'no-empty': 'off'
    }
  },
  {
    files: ['**/*.vue'],
    plugins: {
      vue: pluginVue
    },
    languageOptions: {
      globals: {
        ...globals,
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly'
      },
      parser: vueParser
    },
    rules: {
      'vue/multi-word-component-names': 'off',
      'vue/no-v-html': 'warn',
      'vue/require-default-prop': 'off',
      'vue/require-explicit-emits': 'warn',
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
      'no-constant-binary-expression': 'off',
      'no-empty': 'off'
    }
  },
  {
    ignores: ['node_modules/**', 'dist/**', 'out/**', '.vite/**']
  }
];
