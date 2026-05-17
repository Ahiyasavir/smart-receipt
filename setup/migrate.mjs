/**
 * Applies all pending SQL migrations to Supabase.
 * Runs automatically in GitHub Actions on every push.
 * Requires: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars.
 *
 * Uses the Supabase Management API — also needs SUPABASE_ACCESS_TOKEN
 * (generate once at https://supabase.com/dashboard/account/tokens)
 */

import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const PROJECT_REF = process.env.SUPABASE_PROJECT_REF || 'krtcjxkronmxribkccab';
const PAT         = process.env.SUPABASE_ACCESS_TOKEN;

if (!PAT) {
  console.warn('⚠️  SUPABASE_ACCESS_TOKEN is not set — skipping migrations.');
  console.warn('   To enable auto-migrations:');
  console.warn('   1. Generate a token at https://supabase.com/dashboard/account/tokens');
  console.warn('   2. Add it as a GitHub secret named SUPABASE_ACCESS_TOKEN');
  console.warn('   3. Optionally add SUPABASE_PROJECT_REF (default: krtcjxkronmxribkccab)');
  console.warn('   SQL files in setup/sql/ must be applied manually until then.');
  process.exit(0);
}

async function runSql(sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method:  'POST',
    headers: {
      'Authorization': `Bearer ${PAT}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({ query: sql }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`SQL failed (${res.status}): ${text}`);
  }
  return res.json();
}

// Ensure migration tracking table exists
await runSql(`
  CREATE TABLE IF NOT EXISTS _migrations (
    name      text primary key,
    applied_at timestamptz default now()
  );
`);

// Read all .sql files from setup/sql/ sorted by name
const sqlDir   = join(__dir, 'sql');
const allFiles = readdirSync(sqlDir).filter((f) => f.endsWith('.sql')).sort();

// Fetch already-applied migrations
const { rows: applied } = await runSql('SELECT name FROM _migrations');
const appliedSet = new Set((applied ?? []).map((r) => r.name));

let count = 0;
for (const file of allFiles) {
  if (appliedSet.has(file)) {
    console.log(`  ✓ ${file} (already applied)`);
    continue;
  }
  const sql = readFileSync(join(sqlDir, file), 'utf8');
  console.log(`  → Applying ${file}…`);
  await runSql(sql);
  await runSql(`INSERT INTO _migrations (name) VALUES ('${file.replace(/'/g, "''")}') ON CONFLICT DO NOTHING`);
  console.log(`  ✓ ${file} done`);
  count++;
}

console.log(`\nMigrations complete. Applied: ${count}, Skipped: ${allFiles.length - count}`);
