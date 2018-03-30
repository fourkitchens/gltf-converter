module.exports = {
  plugins: ['jest', 'prettier'],
  env: { 'jest/globals': true },
  extends: ['airbnb-base', 'prettier'],
  rules: {
    'import/no-extraneous-dependencies': [
      'error',
      { devDependencies: ['scripts/**'] },
    ],
    'prettier/prettier': ['error', { trailingComma: 'es5', singleQuote: true }],
    'no-console': ['off'],
  },
};
