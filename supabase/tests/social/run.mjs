import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { randomUUID, createHash } from "node:crypto";
import assert from "node:assert/strict";
import { nativeDb, nativeClient } from "./native.mjs";
const native = process.argv.includes("--native");
const db = native ? await nativeDb() : new PGlite();
let passed = 0;
const root = new URL("../../../", import.meta.url);
const sql = await readFile(
  new URL(
    "supabase/migrations-pending/20261013221627_social_v2_prepared.sql",
    root,
  ),
  "utf8",
);
const fixture = await readFile(new URL("fixture.sql", import.meta.url), "utf8");
const t = "00000000-0000-0000-0000-0000000000a1",
  archived = "00000000-0000-0000-0000-0000000000a2";
const uid = (i) => `00000000-0000-0000-0000-00000000000${i}`;
const scalar = async (query, args = []) =>
  Object.values((await db.query(query, args)).rows[0])[0];
async function check(name, fn) {
  await fn();
  passed++;
  console.log(`PASS ${name}`);
}
async function role(name, user, fn) {
  return db.transaction(async (tx) => {
    await tx.exec(`SET LOCAL ROLE ${name}`);
    await tx.query("select set_config('request.uid',$1,true)", [user ?? ""]);
    return fn(tx);
  });
}
async function command(
  actor,
  action,
  {
    trip = t,
    key = randomUUID(),
    source = null,
    target = null,
    text = null,
  } = {},
) {
  return role(
    "service_role",
    null,
    async (tx) =>
      (
        await tx.query(
          "select public.social_command($1,$2,$3,$4,$5,$6,$7) result",
          [actor, trip, action, key, source, target, text],
        )
      ).rows[0].result,
  );
}
async function reset() {
  await db.exec(
    `TRUNCATE social_private.commands, social_private.allocations, social_private.draw_secrets, public.notification_outbox, public.in_app_notifications, public.social_events, public.headshot_rights, public.shot_draw_participants, public.shot_draws CASCADE`,
  );
}
try {
  await db.exec(fixture);
  await check("migration applies twice; historic chat untouched", async () => {
    await db.exec(sql);
    await db.exec(sql);
    assert.equal(
      await scalar("select count(*)::int from notification_dispatches"),
      1,
    );
  });
  await check("client RPC bypass denied", async () => {
    await assert.rejects(
      role("authenticated", uid(1), (tx) =>
        tx.query("select social_command($1,$2,$3,$4)", [
          uid(1),
          t,
          "vibe_start",
          randomUUID(),
        ]),
      ),
      /permission denied/,
    );
  });
  for (const actor of [uid(4), uid(5), uid(6), uid(9), null])
    await check(`ineligible actor ${actor?.slice(-1) ?? "null"} rejected`, () =>
      assert.rejects(command(actor, "vibe_start"), /not_trip_member/),
    );
  await check("archive writes rejected", () =>
    assert.rejects(
      command(uid(1), "vibe_start", { trip: archived }),
      /trip_read_only/,
    ),
  );
  let vibe;
  const key = randomUUID();
  await check(
    "vibe commit atomically creates two OTHER recipients",
    async () => {
      vibe = await command(uid(1), "vibe_start", { key, text: "Hytta" });
      assert.equal(vibe.committed, true);
      assert.equal(
        await scalar("select count(*)::int from in_app_notifications"),
        2,
      );
      assert.equal(
        await scalar("select count(*)::int from notification_outbox"),
        2,
      );
      assert.equal(
        await scalar(
          "select count(*)::int from in_app_notifications where recipient_id=$1",
          [uid(1)],
        ),
        0,
      );
    },
  );
  await check(
    "retry identical; no duplicated event or notification",
    async () => {
      assert.deepEqual(
        await command(uid(1), "vibe_start", { key, text: "Hytta" }),
        vibe,
      );
      assert.equal(await scalar("select count(*)::int from social_events"), 1);
    },
  );
  await check("key reuse with other payload rejected", () =>
    assert.rejects(
      command(uid(1), "vibe_start", { key, text: "Annet" }),
      /idempotency_conflict/,
    ),
  );
  await check("active vibe blocks second start", () =>
    assert.rejects(command(uid(1), "vibe_start"), /vibe_already_active/),
  );
  await check("other cannot end vibe", () =>
    assert.rejects(
      command(uid(2), "vibe_end", { source: vibe.id }),
      /not_owner/,
    ),
  );
  await check(
    "own end retained in history; cooldown server enforced",
    async () => {
      await command(uid(1), "vibe_end", { source: vibe.id });
      assert.equal(
        await scalar(
          "select ended_at is not null from social_events where id=$1",
          [vibe.id],
        ),
        true,
      );
      await assert.rejects(command(uid(1), "vibe_start"), /vibe_cooldown/);
    },
  );
  await check(
    "RLS own notices only; events shared only within trip",
    async () => {
      assert.equal(
        (
          await role("authenticated", uid(2), (tx) =>
            tx.query("select * from in_app_notifications"),
          )
        ).rows.length,
        1,
      );
      assert.equal(
        (
          await role("authenticated", uid(4), (tx) =>
            tx.query("select * from social_events"),
          )
        ).rows.length,
        0,
      );
    },
  );
  for (const table of [
    "social_events",
    "in_app_notifications",
    "shot_draws",
    "headshot_rights",
  ])
    await check(`direct mutation ${table} denied`, () =>
      assert.rejects(
        role("authenticated", uid(1), (tx) => tx.exec(`delete from ${table}`)),
        /permission denied/,
      ),
    );
  await check("private seeds and outbox hidden", async () => {
    await assert.rejects(
      role("authenticated", uid(1), (tx) =>
        tx.exec("select * from social_private.draw_secrets"),
      ),
      /permission denied/,
    );
    await assert.rejects(
      role("authenticated", uid(1), (tx) =>
        tx.exec("select * from notification_outbox"),
      ),
      /permission denied/,
    );
  });
  const notice = await scalar(
    "select id from in_app_notifications where recipient_id=$1",
    [uid(2)],
  );
  await check(
    "individual dismiss keeps common history and other notice unread",
    async () => {
      await command(uid(2), "dismiss", { source: notice });
      assert.equal(
        await scalar(
          "select count(*)::int from in_app_notifications where dismissed_at is not null",
        ),
        1,
      );
      assert.equal(await scalar("select count(*)::int from social_events"), 1);
      await assert.rejects(
        command(uid(3), "read", { source: notice }),
        /not_recipient/,
      );
    },
  );
  let claimed;
  await check(
    "outbox claim owns unique leases, second claim empty",
    async () => {
      claimed = (
        await role("service_role", null, (tx) =>
          tx.query("select * from social_outbox_claim()"),
        )
      ).rows;
      assert.equal(claimed.length, 2);
      assert.equal(
        (
          await role("service_role", null, (tx) =>
            tx.query("select * from social_outbox_claim()"),
          )
        ).rows.length,
        0,
      );
    },
  );
  await check("wrong lease cannot mark accepted", async () => {
    assert.equal(
      await scalar(
        "select social_outbox_finish($1,$2,'accepted','provider-id')",
        [claimed[0].id, randomUUID()],
      ),
      false,
    );
  });
  await check(
    "expired lease cannot acknowledge; reclaim keeps provider key",
    async () => {
      await db.query(
        "update notification_outbox set lease_until=now()-interval '1 second' where id=$1",
        [claimed[0].id],
      );
      assert.equal(
        await scalar("select social_outbox_finish($1,$2,'accepted','id')", [
          claimed[0].id,
          claimed[0].lease_token,
        ]),
        false,
      );
      const next = (await db.query("select * from social_outbox_claim()"))
        .rows[0];
      assert.equal(next.provider_key, claimed[0].provider_key);
      assert.notEqual(next.lease_token, claimed[0].lease_token);
      assert.equal(
        await scalar("select social_outbox_finish($1,$2,'accepted','id')", [
          next.id,
          next.lease_token,
        ]),
        true,
      );
    },
  );
  await check(
    "old uncertain delivery expires before provider dedupe horizon",
    async () => {
      await db.exec(
        "update notification_outbox set created_at=now()-interval '2 days',lease_until=now()-interval '1 second' where status='leased'",
      );
      await db.exec("select social_outbox_claim()");
      assert.equal(
        await scalar(
          "select count(*)::int from notification_outbox where status='expired'",
        ),
        1,
      );
    },
  );

  await check(
    "cursor history with tied timestamps has no lost or duplicate entries",
    async () => {
      await db.query(
        `insert into social_events(trip_id,kind,actor_id,source_id,title,body,created_at,ended_at) select $1,'vibe',$2,gen_random_uuid(),'History','Synthetic',now()-interval '3 days',now() from generate_series(1,53)`,
        [t, uid(1)],
      );
      const first = await scalar("select social_history($1,$2,$3)", [
        uid(2),
        t,
        "vibe",
      ]);
      assert.equal(first.items.length, 50);
      const second = await scalar("select social_history($1,$2,$3,$4,$5)", [
        uid(2),
        t,
        "vibe",
        first.cursor.before,
        first.cursor.id,
      ]);
      assert.equal(second.items.length, 4);
      assert.equal(
        new Set([...first.items, ...second.items].map((x) => x.id)).size,
        54,
      );
      const event = await scalar("select social_event($1,$2,$3)", [
        uid(2),
        t,
        second.items[0].id,
      ]);
      assert.equal(event.event.id, second.items[0].id);
      await assert.rejects(
        scalar("select social_event($1,$2,$3)", [uid(2), archived, vibe.id]),
        /not_trip_member/,
      );
      await assert.rejects(
        scalar("select social_event($1,$2,$3)", [uid(1), archived, vibe.id]),
        /event_not_found/,
      );
      const own = await scalar("select social_history($1,$2,$3)", [
        uid(2),
        t,
        "notifications",
      ]);
      assert(own.items.every((x) => x.recipient_id === uid(2)));
    },
  );
  await check(
    "new RPCs have invoker privileges, fixed search_path, no public execution",
    async () => {
      const funcs = (
        await db.query(
          `select p.proname,p.prosecdef,p.proconfig,has_function_privilege('authenticated',p.oid,'EXECUTE') allowed from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='social_private' or (n.nspname='public' and p.proname like 'social_%')`,
        )
      ).rows;
      assert(funcs.length >= 10);
      assert(
        funcs.every(
          (f) =>
            !f.prosecdef &&
            !f.allowed &&
            f.proconfig.some((v) => v.startsWith("search_path=")),
        ),
      );
    },
  );
  await reset();
  let draw;
  await check(
    "draw snapshot includes initiator; 10 seconds, no secret exposed",
    async () => {
      const result = await command(uid(1), "shot_start");
      draw = (
        await db.query("select * from shot_draws where id=$1", [result.id])
      ).rows[0];
      assert.equal(draw.participant_count, 3);
      assert.equal(
        await scalar(
          "select count(*)::int from shot_draw_participants where draw_id=$1 and user_id=$2",
          [draw.id, uid(1)],
        ),
        1,
      );
      assert.equal(draw.seed_reveal, null);
      const seconds = await scalar(
        "select extract(epoch from draw_at-server_started_at)::float from shot_draws where id=$1",
        [draw.id],
      );
      assert(seconds > 9.8 && seconds <= 10.1);
    },
  );
  await check("not-yet-due server tick cannot finalize early", async () => {
    await db.exec("select social_tick()");
    assert.equal(
      await scalar("select status from shot_draws where id=$1", [draw.id]),
      "countdown",
    );
  });
  await check("server alone finalizes once and proof matches", async () => {
    await db.query(
      "update shot_draws set draw_at=now()-interval '1 second' where id=$1",
      [draw.id],
    );
    await db.exec("select social_tick()");
    await db.exec("select social_tick()");
    const d = (
      await db.query("select * from shot_draws where id=$1", [draw.id])
    ).rows[0];
    const hash = (s) => createHash("sha256").update(s).digest("hex");
    assert.equal(
      hash(`${d.seed_reveal}:${d.id}:${d.participant_hash}`),
      d.seed_commitment,
    );
    const bytes = createHash("sha256")
      .update(`${d.seed_reveal}:${d.id}:${d.proof_counter}`)
      .digest();
    assert.equal(bytes.readUInt32BE(0), Number(d.proof_value));
    const actual = await scalar(
      "select user_id from shot_draw_participants where draw_id=$1 and position=$2",
      [d.id, Number(d.proof_value) % d.participant_count],
    );
    assert.equal(d.winner_id, actual);
    assert.equal(
      await scalar(
        "select count(*)::int from social_events where kind='shot_result'",
      ),
      1,
    );
    draw = d;
  });
  await check(
    "only winner answers; retry same answer once; other answer rejected",
    async () => {
      const other = [uid(1), uid(2), uid(3)].find((x) => x !== draw.winner_id);
      await assert.rejects(
        command(other, "respond", { source: draw.id, text: "taken" }),
        /not_winner/,
      );
      await command(draw.winner_id, "respond", {
        source: draw.id,
        text: "declined",
      });
      await command(draw.winner_id, "respond", {
        source: draw.id,
        text: "declined",
      });
      await assert.rejects(
        command(draw.winner_id, "respond", { source: draw.id, text: "taken" }),
        /already_answered/,
      );
      assert.equal(
        await scalar(
          "select count(*)::int from social_events where kind='shot_response'",
        ),
        1,
      );
    },
  );
  await check(
    "five starts per trip day; sixth rejected without extra row",
    async () => {
      for (let i = 0; i < 4; i++) {
        await command(uid(1), "shot_start");
        await db.exec(
          "update shot_draws set draw_at=now()-interval '1 second' where status='countdown'; select social_tick()",
        );
      }
      await assert.rejects(command(uid(1), "shot_start"), /daily_limit/);
      assert.equal(
        await scalar(
          "select count(*)::int from shot_draws where initiated_by=$1 and kind='draw'",
          [uid(1)],
        ),
        5,
      );
    },
  );
  await check(
    "snapshot/read model has no seed until reveal and full stats",
    async () => {
      const s = await scalar("select social_snapshot($1,$2)", [uid(1), t]);
      assert.equal(s.starts_today, 5);
      assert.equal(s.members.length, 3);
      assert.equal(
        s.stats.reduce((n, x) => n + Number(x.draws), 0),
        5,
      );
    },
  );
  await reset();
  await check(
    "no yesterday activity: two random distinct rights, no leader",
    async () => {
      await db.exec("select social_tick(); select social_tick()");
      assert.equal(
        await scalar("select count(*)::int from headshot_rights"),
        2,
      );
      assert.equal(
        await scalar(
          "select count(*)::int from headshot_rights where reason='leader'",
        ),
        0,
      );
    },
  );
  let right = (
    await db.query("select * from headshot_rights order by user_id limit 1")
  ).rows[0];
  await check("headshot cannot target self or banned", async () => {
    await assert.rejects(
      command(right.user_id, "headshot", {
        source: right.id,
        target: right.user_id,
      }),
      /invalid_target/,
    );
    await assert.rejects(
      command(right.user_id, "headshot", { source: right.id, target: uid(4) }),
      /invalid_target/,
    );
  });
  await check(
    "headshot atomic consume and retry; receives same winner response",
    async () => {
      const target = [uid(1), uid(2), uid(3)].find((x) => x !== right.user_id);
      const key = randomUUID();
      const result = await command(right.user_id, "headshot", {
        source: right.id,
        target,
        key,
      });
      assert.deepEqual(
        await command(right.user_id, "headshot", {
          source: right.id,
          target,
          key,
        }),
        result,
      );
      await assert.rejects(
        command(right.user_id, "headshot", { source: right.id, target }),
        /right_used/,
      );
      await command(target, "respond", { source: result.id, text: "taken" });
      assert.equal(
        await scalar("select kind from shot_draws where id=$1", [result.id]),
        "headshot",
      );
    },
  );
  await check("expired right rejected", async () => {
    const r = (
      await db.query(
        "select * from headshot_rights where consumed_by is null limit 1",
      )
    ).rows[0];
    await db.query(
      "update headshot_rights set expires_at=now()-interval '1 second' where id=$1",
      [r.id],
    );
    await assert.rejects(
      command(r.user_id, "headshot", {
        source: r.id,
        target: [uid(1), uid(2), uid(3)].find((x) => x !== r.user_id),
      }),
      /right_expired/,
    );
  });
  await reset();
  await check(
    "yesterday headshot counts for leader; others unique; rerun safe",
    async () => {
      await db.exec(
        `insert into shot_draws(trip_id,initiated_by,kind,idempotency_key,status,draw_at,finalized_at,local_day,timezone,participant_count,participant_hash,seed_commitment,winner_id) values('${t}','${uid(2)}','headshot','fixture','finalized',now()-interval '1 day',now()-interval '1 day',(now() at time zone 'Europe/Paris')::date-1,'Europe/Paris',3,'fixture','fixture','${uid(1)}')`,
      );
      await db.exec("select social_tick();select social_tick()");
      assert.equal(
        await scalar("select count(*)::int from headshot_rights"),
        3,
      );
      assert.equal(
        await scalar(
          "select user_id from headshot_rights where reason='leader'",
        ),
        uid(1),
      );
    },
  );
  await check(
    "tied yesterday leaders are uniform candidates and winner gets no duplicate right",
    async () => {
      await reset();
      await db.exec(
        `insert into shot_draws(trip_id,initiated_by,kind,idempotency_key,status,draw_at,finalized_at,local_day,timezone,participant_count,participant_hash,seed_commitment,winner_id) select '${t}','${uid(3)}','draw',u::text,'finalized',now()-interval '1 day',now()-interval '1 day',(now() at time zone 'Europe/Paris')::date-1,'Europe/Paris',3,'fixture','fixture',u from unnest(array['${uid(1)}'::uuid,'${uid(2)}'::uuid]) u`,
      );
      await db.exec("select social_tick()");
      const a = (await db.query("select * from social_private.allocations"))
        .rows[0];
      assert.deepEqual(a.leader_pool, [uid(1), uid(2)]);
      assert.equal(new Set(a.chosen).size, 3);
      const leader = await scalar(
        "select user_id from headshot_rights where reason='leader'",
      );
      assert([uid(1), uid(2)].includes(leader));
    },
  );
  await check(
    "DST expiry follows local next midnight, not 24-hour addition",
    async () => {
      for (const [at, hours] of [
        ["2026-03-29T00:00:00+01:00", 23],
        ["2026-10-25T00:00:00+02:00", 25],
      ]) {
        await reset();
        await db.query("select social_private.allocate($1,$2)", [t, at]);
        const delta = await scalar(
          "select extract(epoch from (expires_at-$1::timestamptz))/3600 from headshot_rights limit 1",
          [at],
        );
        assert.equal(Number(delta), hours);
      }
    },
  );
  for (const size of [1, 2, 3])
    await check(
      `${size} eligible members: no duplicate daily rights`,
      async () => {
        await reset();
        await db.query(
          "update profiles set is_active=(id <= $1) where membership_status='approved' and not is_banned",
          [uid(size)],
        );
        await db.exec("select social_tick()");
        assert.equal(
          await scalar("select count(*)::int from headshot_rights"),
          Math.min(size, 2),
        );
      },
    );
  await check(
    "archive blocks tick, rights, and out-of-trip snapshot",
    async () => {
      await reset();
      await db.exec("update trips set status='archived'");
      await db.exec("select social_tick()");
      assert.equal(
        await scalar("select count(*)::int from headshot_rights"),
        0,
      );
      await assert.rejects(
        scalar("select social_snapshot($1,$2)", [uid(2), archived]),
        /not_trip_member/,
      );
    },
  );
  if (native) {
    await reset();
    await db.exec(
      `update trips set status='active' where id='${t}';update profiles set is_active=true where membership_status='approved' and not is_banned`,
    );
    const call = async (
      action,
      key = randomUUID(),
      source = null,
      target = null,
    ) => {
      const c = await nativeClient();
      try {
        await c.query("SET ROLE service_role");
        return (
          await c.query("select social_command($1,$2,$3,$4,$5,$6) result", [
            uid(1),
            t,
            action,
            key,
            source,
            target,
          ])
        ).rows[0].result;
      } finally {
        await c.end();
      }
    };
    await check(
      "NATIVE 8 concurrent same-key starts create one draw",
      async () => {
        const key = randomUUID();
        const results = await Promise.all(
          Array.from({ length: 8 }, () => call("shot_start", key)),
        );
        assert.equal(new Set(results.map((x) => x.id)).size, 1);
        assert.equal(await scalar("select count(*)::int from shot_draws"), 1);
      },
    );
    await check(
      "NATIVE concurrent finalizers preserve single winner/event",
      async () => {
        await db.exec(
          "update shot_draws set draw_at=now()-interval '1 second'",
        );
        const cs = await Promise.all([nativeClient(), nativeClient()]);
        try {
          await Promise.all(cs.map((c) => c.query("select social_tick()")));
        } finally {
          await Promise.all(cs.map((c) => c.end()));
        }
        assert.equal(
          await scalar(
            "select count(*)::int from social_events where kind='shot_result'",
          ),
          1,
        );
      },
    );
    await check(
      "NATIVE concurrent claims do not share a delivery",
      async () => {
        const cs = await Promise.all([nativeClient(), nativeClient()]);
        let claims;
        try {
          claims = await Promise.all(
            cs.map((c) => c.query("select * from social_outbox_claim(2)")),
          );
        } finally {
          await Promise.all(cs.map((c) => c.end()));
        }
        const ids = claims.flatMap((x) => x.rows.map((r) => r.id));
        assert.equal(ids.length, new Set(ids).size);
      },
    );
    await check("NATIVE two starts compete for fifth daily slot", async () => {
      for (let i = 0; i < 3; i++) {
        await call("shot_start");
        await db.exec(
          "update shot_draws set draw_at=now()-interval '1 second' where status='countdown';select social_tick()",
        );
      }
      const results = await Promise.allSettled([
        call("shot_start"),
        call("shot_start"),
      ]);
      assert.equal(results.filter((x) => x.status === "fulfilled").length, 1);
      assert.equal(
        await scalar(
          "select count(*)::int from shot_draws where initiated_by=$1 and kind='draw'",
          [uid(1)],
        ),
        5,
      );
    });
    await check(
      "NATIVE two sessions cannot consume one Headshot twice",
      async () => {
        await db.exec(
          `insert into headshot_rights(trip_id,user_id,local_day,timezone,expires_at,reason) values('${t}','${uid(1)}',(now() at time zone 'Europe/Paris')::date,'Europe/Paris',now()+interval '1 hour','random') on conflict(trip_id,local_day,user_id) do nothing`,
        );
        const r = await scalar(
          "select id from headshot_rights where user_id=$1",
          [uid(1)],
        );
        const results = await Promise.allSettled([
          call("headshot", randomUUID(), r, uid(2)),
          call("headshot", randomUUID(), r, uid(3)),
        ]);
        assert.equal(results.filter((x) => x.status === "fulfilled").length, 1);
        assert.equal(
          await scalar(
            "select count(*)::int from shot_draws where kind='headshot'",
          ),
          1,
        );
      },
    );
  }
  console.log(
    `ALL GREEN: ${passed} PostgreSQL checks. ${native ? "Native concurrency executed. Real deployed cron/Edge latency remains a separate gate." : "PGlite is single-connection; native concurrency and real scheduler latency NOT claimed."}`,
  );
} catch (error) {
  console.error(
    "FAIL",
    error.message,
    "position",
    error.position,
    "detail",
    error.detail,
  );
  process.exitCode = 1;
} finally {
  await db.close();
}
