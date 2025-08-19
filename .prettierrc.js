module.exports = {
  // Line length
  printWidth: 100,

  // Indentation
  tabWidth: 2,
  useTabs: false,

  // Semicolons
  semi: true,

  // Quotes
  singleQuote: true,
  quoteProps: 'as-needed',

  // JSX
  jsxSingleQuote: false,

  // Trailing commas
  trailingComma: 'none',

  // Brackets
  bracketSpacing: true,
  bracketSameLine: false,

  // Arrow functions
  arrowParens: 'always',

  // Line endings
  endOfLine: 'lf',

  // HTML whitespace sensitivity
  htmlWhitespaceSensitivity: 'css',

  // Vue files
  vueIndentScriptAndStyle: false,

  // Markdown
  proseWrap: 'preserve',

  // Embedded language formatting
  embeddedLanguageFormatting: 'auto',

  // Overrides for specific file types
  overrides: [
    {
      files: '*.md',
      options: {
        proseWrap: 'always',
      },
    },
    {
      files: '*.json',
      options: {
        printWidth: 80,
      },
    },
    {
      files: ['*.yml', '*.yaml'],
      options: {
        tabWidth: 2,
      },
    },
  ],
};
