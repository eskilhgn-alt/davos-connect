// Isolated real PostgreSQL via PGlite. Not evidence of concurrent sessions.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const { PGlite } = await import(process.env.PORT0_PGLITE_MODULE || '@electric-sql/pglite');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const db = new PGlite();
async function run(file) {
  await db.exec(await readFile(path.join(root,file),'utf8'));
  console.log('PASS',file);
}
try {
  console.log((await db.query('select version()')).rows[0].version);
  await run('supabase/tests/port0/fixture.sql');
  for(let pass=1;pass<=2;pass++) {
    await run('supabase/migrations-pending/20260816a_trip_status_draft.sql');
    await run('supabase/migrations-pending/20260816b_trip_save_patch_rpc.sql');
    await run('supabase/migrations/20260916052024_trip_save_compatibility_guards.sql');
  }
  await run('supabase/tests/trip-save/behavior.sql');
  console.log('All trip-save SQL tests passed. Native concurrency and real devices NOT tested.');
} catch(e) {
  console.error('FAIL',e.code,e.message,e.where || ''); process.exitCode=1;
} finally { await db.close(); }
