module.exports = {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  transform: {
    // '^.+\\.(ts|tsx)$': [
    //   'ts-jest',
    //   {

    //   },
    // ],
    '^.+\\.tsx?$': [
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
              path: 'node_modules/ts-jest-mock-import-meta', // or, alternatively, 'ts-jest-mock-import-meta' directly, without node_modules.
              options: {
                metaObjectReplacement: { url: 'https://www.url.com' },
              },
            },
          ],
        },
      },
    ],
  },

  extensionsToTreatAsEsm: ['.ts'],
  testMatch: ['**/*.test.ts'],
};
