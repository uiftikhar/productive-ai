import esbuild from 'esbuild';

esbuild
  .build({
    entryPoints: ['src/index.ts'],
    bundle: true,
    minify: true,
    platform: 'node',
    target: 'node16',
    format: 'cjs',
    outfile: 'dist/index.cjs',
    loader: {
      '.html': 'text',
    },
  })
  .catch(() => process.exit(1));
