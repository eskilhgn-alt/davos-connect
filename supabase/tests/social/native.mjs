import pg from "pg";
export async function nativeClient() {
  const host = process.env.SOCIAL_TEST_PG_SOCKET;
  if (!host || !/^\/tmp\/guttahutte-social-[A-Za-z0-9]+\/socket$/.test(host))
    throw new Error(
      "Only disposable /tmp/guttahutte-social-*/socket is accepted; remote DB forbidden",
    );
  const c = new pg.Client({
    host,
    port: 5432,
    user: "postgres",
    database: "postgres",
    password: "",
    ssl: false,
    connectionTimeoutMillis: 5000,
  });
  await c.connect();
  await c.query("set statement_timeout='15s'");
  return c;
}
export async function nativeDb() {
  const c = await nativeClient();
  if (
    Number(
      (
        await c.query(
          "select count(*) from pg_tables where schemaname='public'",
        )
      ).rows[0].count,
    ) !== 0
  ) {
    await c.end();
    throw new Error("Refusing a non-empty database");
  }
  const adapter = {
    query: (q, args) => c.query(q, args),
    exec: (q) => c.query(q),
    close: () => c.end(),
    transaction: async (fn) => {
      await c.query("BEGIN");
      try {
        const result = await fn(adapter);
        await c.query("COMMIT");
        return result;
      } catch (e) {
        await c.query("ROLLBACK");
        throw e;
      }
    },
  };
  return adapter;
}
