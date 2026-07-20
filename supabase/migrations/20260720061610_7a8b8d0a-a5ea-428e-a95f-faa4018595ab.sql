DO $$
DECLARE
  r text;
BEGIN
  RAISE NOTICE 'current_user=%', current_user;
  FOR r IN SELECT rolname FROM pg_roles WHERE pg_has_role(current_user, oid, 'MEMBER') LOOP
    RAISE NOTICE 'member of %', r;
  END LOOP;
END $$;