module.exports = {
  root: true,
  env: {
    browser: true,
    node: true,
    es2021: true,
    jest: true,
  },
  extends: [
    'eslint:recommended',
    'plugin:react/recommended',
    'plugin:react-hooks/recommended',
    'plugin:jsx-a11y/recommended',
  ],
  parserOptions: {
    ecmaVersion: 2021,
    sourceType: 'module',
    ecmaFeatures: {
      jsx: true,
    },
  },
  plugins: ['react', 'react-hooks', 'jsx-a11y', 'import'],
  settings: {
    react: {
      version: 'detect',
    },
    'import/resolver': {
      node: {
        extensions: ['.js', '.jsx', '.ts', '.tsx'],
      },
      alias: {
        map: [
          ['@', './src'],
          ['@main', './src/main'],
          ['@renderer', './src/renderer'],
          ['@shared', './src/shared'],
        ],
      },
    },
  },
  rules: {
    // General
    'no-console': process.env.NODE_ENV === 'production' ? 'error' : 'warn',
    'no-debugger': 'error',
    'no-unused-vars': 'off',
    'prefer-const': 'error',
    'no-var': 'error',
    'object-shorthand': 'off',
    'no-constant-condition': 'off',
    'no-useless-catch': 'off',
    'prefer-template': 'off',

    // React
    'react/prop-types': 'off', // We'll use TypeScript eventually
    'react/react-in-jsx-scope': 'off', // Not needed in React 17+
    'react/jsx-uses-react': 'off',
    'react/jsx-filename-extension': [
      'off',
      { extensions: ['.js', '.jsx', '.tsx'] },
    ],
    'react/jsx-props-no-spreading': 'off',
    'react/function-component-definition': 'off',

    // React Hooks
    'react-hooks/rules-of-hooks': 'error',
    'react-hooks/exhaustive-deps': 'off',

    // Import
    'import/order': 'off',
    'import/no-duplicates': 'off',
    'import/no-unresolved': 'off',
    'import/newline-after-import': 'off',

    // Accessibility
    'jsx-a11y/anchor-is-valid': 'error',
    'jsx-a11y/click-events-have-key-events': 'off',
    'jsx-a11y/no-static-element-interactions': 'off',
    'jsx-a11y/label-has-associated-control': 'off',
    'jsx-a11y/no-autofocus': 'off',
    'jsx-a11y/no-noninteractive-tabindex': 'off',
    'jsx-a11y/no-noninteractive-element-interactions': 'off',
    'no-control-regex': 'off',

    // Custom Security Rules for Electron IPC
    // Prevent insecure IPC patterns
    'no-restricted-syntax': [
      'error',
      {
        selector: 'CallExpression[callee.name="sendSync"]',
        message:
          'Synchronous IPC calls are blocking and should be avoided. Use invoke() instead.',
      },
      {
        selector: 'CallExpression[callee.name="sendToHost"]',
        message: 'sendToHost is insecure. Use proper IPC channels.',
      },
      {
        selector: 'MemberExpression[object.name="remote"]',
        message:
          'Electron remote module is deprecated and insecure. Use IPC instead.',
      },
      {
        selector: 'CallExpression[callee.object.name="remote"]',
        message:
          'Electron remote module is deprecated and insecure. Use IPC instead.',
      },
    ],

    // Prevent insecure webPreferences
    'no-restricted-properties': [
      'error',
      {
        object: 'webPreferences',
        property: 'nodeIntegration',
        message:
          'nodeIntegration should be false for security. Use contextBridge instead.',
      },
      {
        object: 'webPreferences',
        property: 'contextIsolation',
        message: 'contextIsolation must be true for security.',
      },
      {
        object: 'webPreferences',
        property: 'enableRemoteModule',
        message: 'enableRemoteModule should be false. Use IPC instead.',
      },
    ],

    // Custom security warnings
    'no-eval': 'error',
    'no-implied-eval': 'error',
    'no-new-func': 'error',

    // Code style
    indent: 'off',
    quotes: 'off',
    semi: 'off',
    'comma-dangle': 'off',
    'max-len': 'off',
    'arrow-parens': ['off', 'as-needed'],
    'object-curly-spacing': 'off',
    'array-bracket-spacing': 'off',
    'space-before-function-paren': 'off',
    'no-empty': 'off',
    'react/no-unescaped-entities': 'off',
  },
  overrides: [
    {
      files: ['*.test.js', '*.spec.js'],
      env: {
        jest: true,
      },
      rules: {
        'no-console': 'off',
        'import/order': 'off',
        quotes: 'off',
        'comma-dangle': 'off',
        'arrow-parens': 'off',
      },
    },
    {
      files: ['src/main/**/*.js'],
      env: {
        browser: false,
        node: true,
      },
    },
  ],
};
