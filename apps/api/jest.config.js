/** @type {import('jest').Config} */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/../tsconfig.json' }] },
  moduleNameMapper: {
    '^@crm/shared$': '<rootDir>/../../../packages/shared/src/index.ts',
    // shared uses ESM-style .js specifiers; strip them for ts-jest (CommonJS).
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  collectCoverageFrom: ['**/*.ts', '!**/*.spec.ts', '!main.ts'],
  testEnvironment: 'node',
};
