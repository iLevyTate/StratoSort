module.exports = {
  root: true,
  env: {
    browser: true,
    es2022: true,
    node: true,
    jest: true,
  },
  extends: [
    'eslint:recommended',
    'airbnb-base',
    'plugin:react/recommended',
    'plugin:react-hooks/recommended',
    'plugin:jsx-a11y/recommended',
    'plugin:import/recommended',
    'plugin:promise/recommended',
    'plugin:jest/recommended',
  ],
  plugins: [
    'react',
    'react-hooks',
    'jsx-a11y',
    'import',
    'promise',
    'jest',
  ],
  parser: '@babel/eslint-parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    ecmaFeatures: {
      jsx: true,
    },
    requireConfigFile: false,
    babelOptions: {
      presets: ['@babel/preset-react'],
    },
  },
  settings: {
    react: {
      version: 'detect',
    },
    'import/resolver': {
      webpack: {
        config: './webpack.config.js',
      },
      node: {
        extensions: ['.js', '.jsx', '.json'],
      },
    },
  },
  rules: {
    // Production-ready rules
    'no-console': 'warn',
    'no-debugger': 'error',
    'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    'prefer-const': 'error',
    'no-var': 'error',
    'object-shorthand': 'error',
    'prefer-template': 'error',
    
    // React specific
    'react/prop-types': 'error',
    'react/jsx-uses-react': 'off', // React 17+
    'react/react-in-jsx-scope': 'off', // React 17+
    'react/jsx-filename-extension': ['error', { extensions: ['.jsx'] }],
    'react/jsx-props-no-spreading': 'off',
    'react/function-component-definition': ['error', {
      namedComponents: 'function-declaration',
      unnamedComponents: 'arrow-function',
    }],
    
    // Import rules
    'import/prefer-default-export': 'off',
    'import/no-extraneous-dependencies': ['error', {
      devDependencies: ['test/**', 'webpack.config.js', '**/*.test.js'],
    }],
    'import/extensions': ['error', 'never', { json: 'always' }],
    
    // Accessibility
    'jsx-a11y/click-events-have-key-events': 'error',
    'jsx-a11y/no-static-element-interactions': 'error',
    
    // Code quality
    'max-len': ['error', { code: 100, ignoreComments: true, ignoreStrings: true }],
    'complexity': ['warn', 10],
    'max-depth': ['warn', 4],
    'max-params': ['warn', 5],
    
    // Electron specific
    'import/no-nodejs-modules': 'off',
  },
  overrides: [
    {
      files: ['src/main/**/*.js'],
      env: {
        node: true,
        browser: false,
      },
      rules: {
        'import/no-nodejs-modules': 'off',
        'no-console': 'off', // Main process logging is ok
      },
    },
    {
      files: ['src/renderer/**/*.js', 'src/renderer/**/*.jsx'],
      env: {
        browser: true,
        node: false,
      },
      rules: {
        'import/no-nodejs-modules': 'error',
      },
    },
    {
      files: ['test/**/*.js'],
      env: {
        jest: true,
        node: true,
      },
      rules: {
        'no-console': 'off',
        'max-len': 'off',
        'import/no-extraneous-dependencies': 'off',
      },
    },
  ],
};