#!/usr/bin/env node
/**
 * Create or refresh the disposable E2E user against a local Supabase instance.
 * Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. Never commit real keys.
 */
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = process.env.E2E_USER_EMAIL || 'e2e-test@immigo.app';
const password = process.env.E2E_USER_PASSWORD || 'E2ETest123!';

if (!url || !serviceRoleKey) {
  console.error('seed:e2e requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const admin = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
});

const { data: listed, error: listError } = await admin.auth.admin.listUsers();
if (listError) {
  console.error(`Could not list users: ${listError.message}`);
  process.exit(1);
}

const existing = listed.users.find((user) => user.email?.toLowerCase() === email.toLowerCase());
if (existing) {
  const { error } = await admin.auth.admin.updateUserById(existing.id, {
    password,
    email_confirm: true,
    user_metadata: { full_name: 'E2E Test User' },
  });
  if (error) {
    console.error(`Could not update the E2E user: ${error.message}`);
    process.exit(1);
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
    console.error(`Could not create the E2E user: ${error.message}`);
    process.exit(1);
  }
  console.log(`E2E user created: ${email}`);
}
