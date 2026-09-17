-- Apply AFTER 20260816a/b, with b and this file in one transaction.
-- Pending until explicit recorded execution. No user data changes.
-- Preserve legacy NULL=omitted, enforce trip access through both RPCs,
-- prevent direct writes from bypassing lifecycle and last-admin protection.

CREATE OR REPLACE FUNCTION public.rpc_admin_patch_trip(p_trip_id uuid, p_patch jsonb)
RETURNS public.trips
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_uid    uuid;
  v_row    public.trips;
  v_key    text;
  v_allowed text[] := ARRAY['name','destination','country','timezone','currency',
                            'start_date','end_date','destination_config'];
  v_start  date;
  v_end    date;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(802613001);
  v_uid := public.assert_trip_admin(p_trip_id);
  PERFORM public.assert_trip_writable(p_trip_id);

  IF p_patch IS NULL OR pg_catalog.jsonb_typeof(p_patch) <> 'object' THEN
    RAISE EXCEPTION 'patch_must_be_object' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  FOR v_key IN SELECT pg_catalog.jsonb_object_keys(p_patch) LOOP
    IF NOT (v_key = ANY (v_allowed)) THEN
      RAISE EXCEPTION 'unknown_field_%', v_key USING ERRCODE = 'invalid_parameter_value';
    END IF;
    IF v_key <> 'destination_config' AND pg_catalog.jsonb_typeof(p_patch->v_key) NOT IN ('string','null') THEN
      RAISE EXCEPTION 'field_must_be_string_%', v_key USING ERRCODE = 'invalid_parameter_value';
    END IF;
  END LOOP;

  -- Obligatoriske felt kan settes, men aldri tømmes.
  FOREACH v_key IN ARRAY ARRAY['name','destination','timezone','currency','destination_config'] LOOP
    IF p_patch ? v_key AND (p_patch->v_key = 'null'::jsonb) THEN
      RAISE EXCEPTION 'field_not_nullable_%', v_key USING ERRCODE = 'not_null_violation';
    END IF;
  END LOOP;
  IF p_patch ? 'name' AND pg_catalog.btrim(p_patch->>'name') = '' THEN
    RAISE EXCEPTION 'name_required' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF p_patch ? 'destination' AND pg_catalog.btrim(p_patch->>'destination') = '' THEN
    RAISE EXCEPTION 'destination_required' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF p_patch ? 'timezone' AND NOT EXISTS (
       SELECT 1 FROM pg_catalog.pg_timezone_names z WHERE z.name = p_patch->>'timezone') THEN
    RAISE EXCEPTION 'invalid_timezone' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF p_patch ? 'currency' AND p_patch->>'currency' !~ '^[A-Z]{3}$' THEN
    RAISE EXCEPTION 'invalid_currency' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF p_patch ? 'destination_config'
     AND pg_catalog.jsonb_typeof(p_patch->'destination_config') <> 'object' THEN
    RAISE EXCEPTION 'destination_config_must_be_object' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  SELECT * INTO v_row FROM public.trips t WHERE t.id = p_trip_id FOR UPDATE;

  -- Datointervallet valideres mot den SAMMENSATTE tilstanden etter patchen,
  -- slik at «tøm startdato» og «sett sluttdato» vurderes sammen.
  v_start := CASE WHEN p_patch ? 'start_date'
                  THEN NULLIF(p_patch->>'start_date','')::date ELSE v_row.start_date END;
  v_end   := CASE WHEN p_patch ? 'end_date'
                  THEN NULLIF(p_patch->>'end_date','')::date ELSE v_row.end_date END;
  IF v_start IS NOT NULL AND v_end IS NOT NULL AND v_start > v_end THEN
    RAISE EXCEPTION 'invalid_date_range' USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.trips SET
    name        = CASE WHEN p_patch ? 'name' THEN pg_catalog.btrim(p_patch->>'name') ELSE name END,
    destination = CASE WHEN p_patch ? 'destination' THEN pg_catalog.btrim(p_patch->>'destination') ELSE destination END,
    country     = CASE WHEN p_patch ? 'country' THEN NULLIF(pg_catalog.btrim(COALESCE(p_patch->>'country','')),'') ELSE country END,
    timezone    = CASE WHEN p_patch ? 'timezone' THEN p_patch->>'timezone' ELSE timezone END,
    currency    = CASE WHEN p_patch ? 'currency' THEN p_patch->>'currency' ELSE currency END,
    start_date  = v_start,
    end_date    = v_end,
    destination_config = CASE WHEN p_patch ? 'destination_config'
                              THEN p_patch->'destination_config' ELSE destination_config END,
    updated_by  = v_uid,
    updated_at  = now()
  WHERE id = p_trip_id
  RETURNING * INTO v_row;

  INSERT INTO public.admin_audit_log (admin_id, action, details)
  VALUES (v_uid, 'trip_updated',
          pg_catalog.jsonb_build_object('trip_id', p_trip_id,
                                        'fields', (SELECT pg_catalog.jsonb_agg(k)
                                                     FROM pg_catalog.jsonb_object_keys(p_patch) k)));
  RETURN v_row;
END $$;

CREATE OR REPLACE FUNCTION public.rpc_admin_update_trip(
  p_trip_id uuid, p_name text DEFAULT NULL, p_destination text DEFAULT NULL,
  p_country text DEFAULT NULL, p_timezone text DEFAULT NULL,
  p_currency text DEFAULT NULL, p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL, p_destination_config jsonb DEFAULT NULL
)
RETURNS public.trips
LANGUAGE sql SECURITY DEFINER SET search_path = ''
AS $$
  SELECT public.rpc_admin_patch_trip(p_trip_id, pg_catalog.jsonb_strip_nulls(
    pg_catalog.jsonb_build_object(
      'name',p_name,'destination',p_destination,'country',p_country,
      'timezone',p_timezone,'currency',p_currency,'start_date',p_start_date,
      'end_date',p_end_date
    )) || CASE WHEN p_destination_config IS NULL THEN '{}'::jsonb
              ELSE pg_catalog.jsonb_build_object('destination_config',p_destination_config) END)
$$;

CREATE OR REPLACE FUNCTION public.rpc_admin_create_trip(
  p_name text,
  p_destination text,
  p_country text DEFAULT NULL,
  p_timezone text DEFAULT 'Europe/Paris',
  p_currency text DEFAULT 'EUR',
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL,
  p_destination_config jsonb DEFAULT '{}'::jsonb
)
RETURNS public.trips
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v_uid uuid := auth.uid(); v_row public.trips;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NOT (public.has_role(v_uid,'admin'::public.app_role) AND public.is_approved_member(v_uid)) THEN
    RAISE EXCEPTION 'not_admin' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_name IS NULL OR pg_catalog.btrim(p_name) = ''
     OR p_destination IS NULL OR pg_catalog.btrim(p_destination) = '' THEN
    RAISE EXCEPTION 'name_and_destination_required' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF p_timezone IS NULL OR NOT EXISTS (SELECT 1 FROM pg_catalog.pg_timezone_names z WHERE z.name=p_timezone) THEN
    RAISE EXCEPTION 'invalid_timezone' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF p_currency IS NULL OR p_currency !~ '^[A-Z]{3}$' THEN
    RAISE EXCEPTION 'invalid_currency' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF p_destination_config IS NOT NULL AND pg_catalog.jsonb_typeof(p_destination_config) <> 'object' THEN
    RAISE EXCEPTION 'destination_config_must_be_object' USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF p_start_date IS NOT NULL AND p_end_date IS NOT NULL AND p_start_date > p_end_date THEN
    RAISE EXCEPTION 'invalid_date_range' USING ERRCODE = 'check_violation';
  END IF;

  -- Ny tur fødes som UTKAST (aldri en andre aktiv tur), og oppretteren blir
  -- turadmin i SAMME transaksjon.
  INSERT INTO public.trips (name, destination, country, timezone, currency,
                            start_date, end_date, destination_config,
                            created_by, updated_by, status)
  VALUES (pg_catalog.btrim(p_name), pg_catalog.btrim(p_destination), p_country,
          p_timezone, p_currency, p_start_date, p_end_date,
          COALESCE(p_destination_config, '{}'::jsonb),
          v_uid, v_uid, 'draft'::public.trip_status)
  RETURNING * INTO v_row;

  INSERT INTO public.trip_members (trip_id, user_id, added_by)
  VALUES (v_row.id, v_uid, v_uid) ON CONFLICT DO NOTHING;

  INSERT INTO public.admin_audit_log (admin_id, action, details)
  VALUES (v_uid, 'trip_created',
          pg_catalog.jsonb_build_object('trip_id', v_row.id, 'name', v_row.name));
  RETURN v_row;
END $$;

-- 6b. Alle trip-/medlemsmutasjoner går gjennom de kontrollerte RPC-ene.
-- Ellers kan direkte DELETE fjerne siste admin og UPDATE omgå turtilgang.
-- Restriktiv SELECT grense hindrer gamle permissive adminpolicyer i å
-- eksponere andre turer eller gi pending/banned brukere lesetilgang.
-- ---------------------------------------------------------------------------
DO $$
DECLARE v_table text; v_cmd text; v_name text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY['trips','trip_members'] LOOP
    FOREACH v_cmd IN ARRAY ARRAY['INSERT','UPDATE','DELETE'] LOOP
      v_name := v_table || '_rpc_only_' || lower(v_cmd);
      IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=v_table AND policyname=v_name) THEN
        IF v_cmd = 'INSERT' THEN
          EXECUTE format('CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (false)',v_name,v_table);
        ELSE
          EXECUTE format('CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR %s TO authenticated USING (false)',v_name,v_table,v_cmd);
        END IF;
      END IF;
    END LOOP;
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='trips' AND policyname='trips_approved_member_read') THEN
    CREATE POLICY trips_approved_member_read ON public.trips AS RESTRICTIVE FOR SELECT TO authenticated
      USING (public.is_approved_member(auth.uid()) AND public.is_trip_member(id,auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='trip_members' AND policyname='trip_members_approved_read') THEN
    CREATE POLICY trip_members_approved_read ON public.trip_members AS RESTRICTIVE FOR SELECT TO authenticated
      USING (public.is_approved_member(auth.uid()) AND (user_id=auth.uid() OR public.is_trip_admin(trip_id,auth.uid())));
  END IF;
END $$;

