import { FullConfig } from '@playwright/test';
import fs from 'fs';
import path from 'path';

async function cleanupArtifacts() {
  const tempPaths = [
    path.join(process.cwd(), 'test-results', '.tmp'),
    path.join(process.cwd(), 'test-results', 'e2e-auth-state.json.tmp'),
  ];
  for (const p of tempPaths) {
    if (fs.existsSync(p)) {
      try { fs.unlinkSync(p); } catch {}
    }
  }
}

async function globalTeardown(config: FullConfig) {
  await cleanupArtifacts();
  console.log('E2E global teardown complete (cleanup done)');
}

export default globalTeardown;
