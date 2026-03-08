/**
 * Delete seed companies (companies with no owner from importCompanies).
 * Run: npx tsx scripts/delete-seed-companies.ts
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  const { data: companies, error: selectError } = await supabase
    .from('companies')
    .select('id, name')
    .is('owner_id', null);

  if (selectError) {
    console.error('Failed to fetch seed companies:', selectError.message);
    process.exit(1);
  }

  const count = companies?.length ?? 0;
  if (count === 0) {
    console.log('No seed companies found (companies with owner_id IS NULL).');
    return;
  }

  console.log(`Found ${count} seed companies to delete.`);

  const { error: deleteError } = await supabase
    .from('companies')
    .delete()
    .is('owner_id', null);

  if (deleteError) {
    console.error('Failed to delete seed companies:', deleteError.message);
    process.exit(1);
  }

  console.log(`Deleted ${count} seed companies.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
