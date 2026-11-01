#!/usr/bin/env node
/**
 * Reject hidden test skips and focused-only suites.
 *
 * A skip is allowed only when the same line or one of the two preceding lines
 * contains: // ALLOW_SKIP: <reason and how to run it>
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const searchRoots = ['src', 'tests', 'amplify', 'eval'];
const ignoredDirectories = new Set(['node_modules', 'dist', 'coverage', 'public', '.git', 'test-results', 'playwright-report']);
const testFilePattern = /\.(test|spec)\.(ts|tsx|js|mjs)$/;

const skipPatterns = [
  { name: 'skip', pattern: /\b(?:describe|it|test)\.(?:skip|skipIf)\b/ },
  { name: 'todo', pattern: /\b(?:it|test)\.todo\b/ },
  { name: 'fixme', pattern: /\b(?:it|test)\.fixme\b/ },
  { name: 'xit/xdescribe', pattern: /\b(?:xit|xdescribe)\s*\(/ },
];
const onlyPattern = /\b(?:describe|it|test)\.only\b/;

const errors = [];

function walk(directory) {
  if (!statSync(directory, { throwIfNoEntry: false })?.isDirectory()) return;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!ignoredDirectories.has(entry.name)) walk(join(directory, entry.name));
      continue;
    }
    if (!entry.isFile() || !testFilePattern.test(entry.name)) continue;

    const absolutePath = join(directory, entry.name);
    const lines = readFileSync(absolutePath, 'utf8').split(/\r?\n/);
    const displayPath = relative(root, absolutePath).replaceAll('\\', '/');

    lines.forEach((line, index) => {
      const trimmed = line.trim();
      // Ignore documentation comments that mention a skip pattern.
      if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) return;

      if (onlyPattern.test(line)) {
        errors.push(`${displayPath}:${index + 1}: focused suite (.only) disables the rest of the test file`);
      }

      for (const { name, pattern } of skipPatterns) {
        if (!pattern.test(line)) continue;
        const context = [lines[index - 2], lines[index - 1], line].filter(Boolean).join('\n');
        if (!context.includes('ALLOW_SKIP:')) {
          errors.push(`${displayPath}:${index + 1}: ${name} without // ALLOW_SKIP: <reason> -> ${line.trim()}`);
        }
      }
    });
  }
}

for (const searchRoot of searchRoots) walk(resolve(root, searchRoot));

if (errors.length > 0) {
  console.error('Skipped/focused test check failed:\n');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log('Skipped/focused test check OK.');
