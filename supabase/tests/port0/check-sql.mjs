// Valgfri, isolert SQL-verifisering når native Postgres ikke kan startes.
// PGlite kjører Postgres, men kan IKKE bevise samtidighet mellom sesjoner.
// Installer PGlite 0.5.8 utenfor repoet og sett PORT0_PGLITE_MODULE til
// pakkens dist/index.js. Ingen prosjektavhengigheter eller produksjonskobling.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const { PGlite } = await import(process.env.PORT0_PGLITE_MODULE || '@electric-sql/pglite');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const db = new PGlite();
async function run(relativePath) {
  const sql = (await readFile(path.join(root, relativePath), 'utf8')).replace(/^\\set ON_ERROR_STOP on\s*$/gm, '');
  await db.exec(sql);
  console.log('PASS', relativePath);
}
try {
  console.log((await db.query('select version()')).rows[0].version);
  await run('supabase/tests/port0/fixture.sql');
  for (let pass = 1; pass <= 2; pass++) {
    for (const file of ['20260813_port0_trip_model_authz.sql', '20260814_port0b_trip_status_draft.sql', '20260815_port0c_trip_rpc_hardening.sql']) {
      await run('supabase/migrations-pending/' + file);
    }
    if (pass === 1) await run('supabase/tests/port0/locations_snapshot.sql');
  }
  await run('supabase/tests/port0/policies.sql');
  await run('supabase/tests/port0/behavior.sql');
  await run('supabase/tests/port0/security.sql');
  console.log('All SQL scripts passed. Native harness/concurrent sessions were not run.');
} catch (error) {
  console.error('FAIL', error.code, error.message, error.where || '');
  process.exitCode = 1;
} finally {
  await db.close();
}
