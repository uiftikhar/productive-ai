module.exports = {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  transform: {
    '^.+\\.(ts|js)?$': [
      'ts-jest',
      {
        useESM: true,
        tsconfig: './tsconfig.test.json', // explicitly use your main tsconfig.json
        diagnostics: {
          ignoreCodes: [1343],
        },
        astTransformers: {
          before: [
            {
              path: 'ts-jest-mock-import-meta',
              options: {
                metaObjectReplacement: { url: 'https://www.url.com' },
              },
            },
          ],
        },
      },
    ],
  },
  // Tell Jest not to ignore ESM modules from p-limit
  transformIgnorePatterns: ['/node_modules/(?!(p-limit|yocto-queue)/)'],

  extensionsToTreatAsEsm: ['.ts'],
  testMatch: ['**/*.test.ts'],
};
