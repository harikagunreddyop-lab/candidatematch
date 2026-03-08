/**
 * Ingest Orion Path Technologies LLC: create user, company, and link profile.
 * Run: npx tsx scripts/ingest-company.ts
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

const EMAIL = 'vinnayvasamsetty@gmail.com';
const PASSWORD = 'amma@118';
const COMPANY_NAME = 'Orion Path Technologies LLC';
const SLUG = 'orion-path-technologies-llc';

async function main() {
  // 1. Create auth user
  const { error: authError } = await supabase.auth.admin.createUser({
    email: EMAIL,
    password: PASSWORD,
    email_confirm: true,
  });

  if (authError) {
    if (authError.message?.includes('already been registered')) {
      console.log('User already exists, continuing with profile lookup...');
    } else {
      console.error('Failed to create user:', authError.message);
      process.exit(1);
    }
  }

  // 2. Wait for profile (handle_new_user trigger) or fetch existing
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  await sleep(500);

  // Ensure profile exists (trigger may have created it)
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, company_id')
    .eq('email', EMAIL)
    .single();

  if (!profile) {
    console.error('Profile not found for', EMAIL);
    process.exit(1);
  }

  if (profile.company_id) {
    console.log('User already has a company. Skipping company creation.');
    return;
  }

  // 3. Create company with owner_id
  const { data: company, error: companyError } = await supabase
    .from('companies')
    .insert({
      name: COMPANY_NAME,
      slug: SLUG,
      owner_id: profile.id,
      website: '',
    })
    .select()
    .single();

  if (companyError) {
    console.error('Failed to create company:', companyError.message);
    process.exit(1);
  }

  // 4. Update profile with company_id and effective_role
  const { error: updateError } = await supabase
    .from('profiles')
    .update({
      company_id: company.id,
      effective_role: 'company_admin',
    })
    .eq('id', profile.id);

  if (updateError) {
    console.error('Failed to update profile:', updateError.message);
    process.exit(1);
  }

  console.log('Ingest complete:');
  console.log('  Company:', COMPANY_NAME);
  console.log('  Email:', EMAIL);
  console.log('  User can sign in with the provided password.');
  console.log('  Recommend changing password after first login.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
