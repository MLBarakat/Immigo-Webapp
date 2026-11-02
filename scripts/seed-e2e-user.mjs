#!/usr/bin/env node
/**
 * Create or refresh the disposable E2E user against the local Supabase instance.
 *
 * Configuration is read from .env.e2e and then .env, matching
 * tests/config/e2e.config.ts. Variables already set in the shell take
 * precedence, so CI can override values without editing files.
 *
 * This script uses a service-role key, so it refuses to target a non-local
 * project. Set E2E_ALLOW_REMOTE=true only for a deliberate staging run.
 *
 * Requires SUPABASE_URL (or VITE_SUPABASE_URL) plus SUPABASE_SERVICE_ROLE_KEY
 * (or SUPABASE_SECRET_KEY). Never commit real keys.
 */
import path from 'node:path';
import { config as dotenvConfig } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenvConfig({ path: path.resolve(process.cwd(), '.env.e2e') });
dotenvConfig({ path: path.resolve(process.cwd(), '.env') });

const url =
  process.env.E2E_SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL ||
  process.env.SUPABASE_URL;
const serviceRoleKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
const email = process.env.E2E_USER_EMAIL || 'e2e-test@immigo.app';
const password = process.env.E2E_USER_PASSWORD || 'E2ETest123!';
const allowRemote = process.env.E2E_ALLOW_REMOTE === 'true';

function fail(message) {
  console.error(message);
  process.exit(1);
}

function jwtClaims(token) {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

if (!url || !serviceRoleKey) {
  fail(
    'seed:e2e requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEY).\n' +
      'Set them in .env.e2e, or copy them from `npx supabase status -o env`.'
  );
}

let hostname;
try {
  hostname = new URL(url).hostname;
} catch {
  fail(`seed:e2e received an invalid SUPABASE_URL: ${url}`);
}

const isLocal = ['127.0.0.1', 'localhost', '::1', '[::1]'].includes(hostname);

if (!isLocal && !allowRemote) {
  fail(
    `seed:e2e refuses to run against non-local Supabase: ${url}\n` +
      'It creates auth users with a service-role key. Use a local stack, or set\n' +
      'E2E_ALLOW_REMOTE=true only when you intend to modify a remote project.'
  );
}

const claims = jwtClaims(serviceRoleKey);
if (isLocal && claims?.ref) {
  fail(
    `seed:e2e has a local URL but a hosted-looking key (project ref: ${claims.ref}).\n` +
      'Put the local service-role key from `npx supabase status -o env` in .env.e2e.'
  );
}

const admin = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
});

const { data: listed, error: listError } = await admin.auth.admin.listUsers();
if (listError) {
  fail(`Could not list users: ${listError.message}`);
}

const existing = listed.users.find((user) => user.email?.toLowerCase() === email.toLowerCase());
if (existing) {
  const { error } = await admin.auth.admin.updateUserById(existing.id, {
    password,
    email_confirm: true,
    user_metadata: { full_name: 'E2E Test User' },
  });
  if (error) {
    fail(`Could not update the E2E user: ${error.message}`);
  }
  console.log(`E2E user refreshed: ${email}`);
} else {
  const { error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: 'E2E Test User' },
  });
  if (error) {
    fail(`Could not create the E2E user: ${error.message}`);
  }
  console.log(`E2E user created: ${email}`);
}

console.log(`Target: ${url}`);
