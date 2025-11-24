import { rmSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

// This script runs as an ES module because the project sets "type": "module".
const __dirname = dirname(fileURLToPath(import.meta.url));

try {
  const functionsPath = join(__dirname, '..', 'amplify', 'functions');
  // Remove node_modules and package-lock.json if they exist. Use force so this is
  // safe to run repeatedly. Any errors are non-fatal — we just log them.
  rmSync(join(functionsPath, 'node_modules'), { recursive: true, force: true });
  rmSync(join(functionsPath, 'package-lock.json'), { force: true });
  console.log('preinstall: cleaned amplify/functions/node_modules and package-lock.json');
} catch (err) {
  console.warn('preinstall: cleanup encountered an error (non-fatal):', err && err.message ? err.message : String(err));
}
