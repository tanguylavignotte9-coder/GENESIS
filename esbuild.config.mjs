import esbuild from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const racine = path.dirname(fileURLToPath(import.meta.url));

const commun = {
  bundle: true,
  sourcemap: true,
  logLevel: 'info',
  target: 'es2022',
};

const builds = [
  {
    ...commun,
    entryPoints: [path.join(racine, 'src/main/main.ts')],
    outfile: path.join(racine, 'dist/main/main.js'),
    platform: 'node',
    format: 'cjs',
    external: ['electron'],
  },
  {
    ...commun,
    entryPoints: [path.join(racine, 'src/preload/preload.ts')],
    outfile: path.join(racine, 'dist/preload/preload.js'),
    platform: 'node',
    format: 'cjs',
    external: ['electron'],
  },
  {
    ...commun,
    entryPoints: [path.join(racine, 'src/renderer/renderer.ts')],
    outfile: path.join(racine, 'dist/renderer/renderer.js'),
    platform: 'browser',
    format: 'iife',
  },
  {
    ...commun,
    entryPoints: [path.join(racine, 'src/sim/worker/simWorker.ts')],
    outfile: path.join(racine, 'dist/renderer/simWorker.js'),
    platform: 'browser',
    format: 'iife',
  },
  {
    ...commun,
    entryPoints: [path.join(racine, 'scripts/banc.ts')],
    outfile: path.join(racine, 'dist/scripts/banc.js'),
    platform: 'node',
    format: 'cjs',
  },
];

for (const b of builds) {
  await esbuild.build(b);
}
