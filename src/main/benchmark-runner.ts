/**
 * Runs the benchmark (the compiled dist/bench/benchmark.mjs) with Electron's own Node.js, so that it
 * works even when Node.js is not installed, and streams its output lines to the display.
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

export interface BenchmarkResult {
  ok: boolean;
  message: string;
  reports: string[];
}

/** Line printed by the benchmark for each report file it wrote. */
const REPORT_PREFIX = 'Rapport écrit : ';

export function runBenchmark(appDir: string, onLine: (line: string) => void): Promise<BenchmarkResult> {
  const script = path.join(appDir, 'dist', 'bench', 'benchmark.mjs');
  if (!existsSync(script)) {
    return Promise.resolve({ ok: false, message: 'Le banc d’essai n’est pas construit : relancez le jeu avec Lancer-GENESIS.bat.', reports: [] });
  }
  return new Promise((resolve) => {
    const reports: string[] = [];
    const child = spawn(process.execPath, [script], { cwd: appDir, env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } });
    let buffered = '';
    const onData = (chunk: Buffer): void => {
      buffered += chunk.toString('utf8');
      const lines = buffered.split(/\r?\n/);
      buffered = lines.pop() ?? '';
      for (const line of lines) {
        if (line.startsWith(REPORT_PREFIX)) reports.push(line.slice(REPORT_PREFIX.length).trim());
        onLine(line);
      }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('error', (error) => resolve({ ok: false, message: `Impossible de lancer le banc d’essai : ${error.message}`, reports }));
    child.on('close', (code) => {
      if (buffered !== '') onLine(buffered);
      resolve(
        code === 0
          ? { ok: true, message: 'Banc d’essai terminé.', reports }
          : { ok: false, message: `Le banc d’essai s’est arrêté sur une erreur (code ${code ?? '?'}).`, reports },
      );
    });
  });
}
