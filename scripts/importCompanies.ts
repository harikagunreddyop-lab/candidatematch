import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  const csvPath = path.join(process.cwd(), 'data', 'companies.csv');
  const text = fs.readFileSync(csvPath, 'utf8');
  const [headerLine, ...lines] = text.split(/\r?\n/).filter(Boolean);

  const rows = lines.map((l) => {
    const [name, website] = l.split(',');
    return { name, website };
  });

  for (let i = 0; i < rows.length; i += 500) {
    const batch = rows.slice(i, i + 500);
    const { error } = await supabase.from('companies').insert(batch);
    if (error) {
      console.error('Insert error at batch', i, error.message);
      process.exit(1);
    }
    console.log(`Inserted ${i + batch.length}/${rows.length}`);
  }

  console.log('Done importing companies.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});