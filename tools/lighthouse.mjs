#!/usr/bin/env node
// Lighthouse CI sobre apps/pwa/dist (CAM-12). CHROME_PATH apunta al Chromium de
// Playwright si no viene definido. El reporte queda solo en disco local.
import { spawnSync } from 'node:child_process';
import { chromium } from 'playwright';

const env = { ...process.env };
env.CHROME_PATH ??= chromium.executablePath();
const r = spawnSync('npx', ['lhci', 'autorun', '--config=apps/pwa/lighthouserc.json'], {
  stdio: 'inherit',
  env,
  shell: process.platform === 'win32',
});
process.exit(r.status ?? 1);
