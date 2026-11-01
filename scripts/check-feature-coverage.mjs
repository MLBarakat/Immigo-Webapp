#!/usr/bin/env node
/**
 * Feature registry integrity check.
 *
 * Fails when:
 * - the registry is missing, malformed, or has duplicate/invalid IDs
 * - an active/protected feature has no test
 * - a mapped entry point or test path does not exist
 * - a feature is missing from the human-readable registry
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const registryPath = resolve(root, 'docs/features.json');
const humanPath = resolve(root, 'docs/FEATURES.md');

const errors = [];
const fail = (message) => errors.push(message);

const allowedStatuses = new Set(['protected', 'active', 'experimental', 'deprecated']);
const requiresTests = new Set(['protected', 'active', 'experimental']);
const testFilePattern = /\.(test|spec)\.(ts|tsx|js|mjs)$/;

function readJson(path) {
  if (!existsSync(path)) {
    fail(`Missing registry: ${path}`);
    return null;
  }
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    fail(`Registry is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

function assertPath(featureId, kind, relativePath) {
  if (typeof relativePath !== 'string' || relativePath.trim() === '') {
    fail(`${featureId}: ${kind} entries must be non-empty strings`);
    return;
  }
  const absolutePath = resolve(root, relativePath);
  if (!existsSync(absolutePath)) {
    fail(`${featureId}: ${kind} path does not exist: ${relativePath}`);
    return;
  }
  if (kind === 'test') {
    if (!statSync(absolutePath).isFile()) {
      fail(`${featureId}: test path is not a file: ${relativePath}`);
    }
    if (!testFilePattern.test(relativePath)) {
      fail(`${featureId}: test path is not a test file: ${relativePath}`);
    }
  }
}

const registry = readJson(registryPath);
const human = existsSync(humanPath) ? readFileSync(humanPath, 'utf8') : '';
if (!human) fail(`Missing human-readable registry: ${humanPath}`);

if (registry) {
  if (typeof registry.version !== 'string' || registry.version.trim() === '') {
    fail('Registry version is missing');
  }
  if (!Array.isArray(registry.features) || registry.features.length === 0) {
    fail('Registry must contain a non-empty features array');
  } else {
    const ids = new Set();
    let protectedCount = 0;
    let activeCount = 0;
    let testCount = 0;

    for (const feature of registry.features) {
      const id = typeof feature.id === 'string' ? feature.id : '<missing-id>';
      if (!/^F-\d{2}$/.test(id)) fail(`${id}: ID must match F-01 style`);
      if (ids.has(id)) fail(`${id}: duplicate feature ID`);
      ids.add(id);

      for (const field of ['title', 'status', 'summary']) {
        if (typeof feature[field] !== 'string' || feature[field].trim() === '') {
          fail(`${id}: missing required field "${field}"`);
        }
      }
      if (!allowedStatuses.has(feature.status)) {
        fail(`${id}: invalid status "${feature.status}"`);
      }
      if (feature.status === 'protected') protectedCount += 1;
      if (feature.status === 'active') activeCount += 1;

      if (!Array.isArray(feature.entryPoints) || feature.entryPoints.length === 0) {
        fail(`${id}: entryPoints must be a non-empty array`);
      } else {
        for (const entryPoint of feature.entryPoints) assertPath(id, 'entry point', entryPoint);
      }

      if (!Array.isArray(feature.tests)) {
        fail(`${id}: tests must be an array`);
      } else {
        if (requiresTests.has(feature.status) && feature.tests.length === 0) {
          fail(`${id}: ${feature.status} features require at least one test`);
        }
        for (const test of feature.tests) assertPath(id, 'test', test);
        testCount += feature.tests.length;
      }

      if (!Array.isArray(feature.invariants) || feature.invariants.length === 0) {
        fail(`${id}: invariants must be a non-empty array`);
      }

      if (human && !human.includes(id)) {
        fail(`${id}: missing from docs/FEATURES.md`);
      }
    }

    console.log(
      `Feature registry OK: ${registry.features.length} features ` +
      `(${protectedCount} protected, ${activeCount} active), ${testCount} test mappings.`
    );
  }
}

if (errors.length > 0) {
  console.error('Feature registry check failed:\n');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}
