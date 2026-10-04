-- usage: psql -v phase=pre|post -f snapshot.sql
DO $$ DECLARE t text; n bigint; h text; BEGIN
  FOREACH t IN ARRAY ARRAY['rounds','round_participants','debt_settlements','polls','poll_options','poll_votes','faktasjekker_threads','faktasjekker_messages','faktasjekker_rate_limits'] LOOP
    EXECUTE format('SELECT count(*), coalesce(md5(string_agg(x::text, ''|'' ORDER BY x::text)),''empty'') FROM public.%I x', t) INTO n, h;
    INSERT INTO public.c01b_snap VALUES (current_setting('c01b.phase'), t, n, h);
  END LOOP;
  INSERT INTO public.c01b_fp VALUES (current_setting('c01b.phase'), public.c01b_fingerprint());
END $$;
