import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '@playwright/test';
import { PUBLIC_SOURCES } from '../scripts/lib/sources.js';

type CapabilityReport = {
  generatedAt: string;
  results: Array<{
    id: string;
    ok: boolean;
    status?: number;
    capabilitySignals: string[];
    textSample?: string;
  }>;
};

test('public capability report exists and contains useful signals', async () => {
  const reportPath = path.resolve(process.cwd(), 'artifacts/official-capabilities.json');
  test.skip(!fs.existsSync(reportPath), 'Run `npm run research:public` first.');

  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8')) as CapabilityReport;
  const resultsById = new Map(report.results.map((result) => [result.id, result]));

  for (const source of PUBLIC_SOURCES) {
    expect(resultsById.has(source.id), `missing report entry for ${source.id}`).toBeTruthy();
  }

  const okResults = report.results.filter((result) => result.ok && (result.status ?? 0) >= 200 && (result.status ?? 0) < 400);
  expect(okResults.length).toBeGreaterThan(0);

  const signalCount = okResults.reduce((sum, result) => sum + result.capabilitySignals.length, 0);
  expect(signalCount).toBeGreaterThan(0);

  const samples = okResults.map((result) => result.textSample ?? '').join(' ');
  expect(samples.length).toBeGreaterThan(50);
});
