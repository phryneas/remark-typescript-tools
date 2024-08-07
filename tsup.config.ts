import type { Options } from 'tsup';
import { defineConfig } from 'tsup';

export default defineConfig((options) => {
  const commonOptions = {
    entry: ['src/index.ts'],
    splitting: false,
    sourcemap: true,
    clean: true,
    dts: true,
    removeNodeProtocol: false,
    ...options,
  } satisfies Options;

  return [
    {
      ...commonOptions,
      name: 'ESM',
      format: ['esm'],
      dts: true,
    },

    {
      ...commonOptions,
      name: 'CJS',
      format: ['cjs'],
      dts: true,
      // Causes `ERR_REQUIRE_ESM` error in Node.js so we inline the dependency.
      noExternal: ['unist-util-visit'],
    },
  ];
});
