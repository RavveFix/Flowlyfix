#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const cwd = process.cwd();
const sentinelPath = path.join(cwd, '.flowly-canonical');

if (!fs.existsSync(sentinelPath)) {
  console.error('[canonical-check] Missing .flowly-canonical in current project root.');
  console.error(`[canonical-check] cwd: ${cwd}`);
  console.error('[canonical-check] Start commands only from the canonical Flowly repository.');
  process.exit(1);
}
