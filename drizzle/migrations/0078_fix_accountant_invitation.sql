-- Bug: an admin could not invite an accountant. The constraint on
-- user_invitations and the role check inside create_invitation both listed
-- only 'manager' and 'dispenser', although 'accountant' has been a real role
-- since 0043. An MD or admin account is still made deliberately, never by
-- whoever holds a link.

ALTER TABLE public.user_invitations
  DROP CONSTRAINT IF EXISTS user_invitations_role_is_invitable;

ALTER TABLE public.user_invitations
  ADD CONSTRAINT user_invitations_role_is_invitable
  CHECK (role IN ('manager', 'dispenser', 'accountant'));

CREATE OR REPLACE FUNCTION public.create_invitation(
  p_email        text,
  p_role         public.user_role,
  p_full_name    text,
  p_full_name_bn text DEFAULT NULL,
  p_phone        text DEFAULT NULL,
  p_valid_days   integer DEFAULT 7
)
RETURNS TABLE (invitation_id uuid, token text, expires_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $fn$
DECLARE
  v_email   text := lower(btrim(p_email));
  v_token   text;
  v_id      uuid;
  v_expires timestamptz;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only an admin may invite someone to this station'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_role NOT IN ('manager', 'dispenser', 'accountant') THEN
    RAISE EXCEPTION
      'An invitation link may only create a dispenser, a manager or an accountant. An admin or MD account is made deliberately, not by whoever holds a URL.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_email !~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$' THEN
    RAISE EXCEPTION 'That is not an email address: %', p_email
      USING ERRCODE = 'check_violation';
  END IF;

  IF coalesce(btrim(p_full_name), '') = '' THEN
    RAISE EXCEPTION 'Say who the invitation is for' USING ERRCODE = 'check_violation';
  END IF;

  IF EXISTS (SELECT 1 FROM auth.users u WHERE lower(u.email) = v_email) THEN
    RAISE EXCEPTION 'There is already an account for %', v_email
      USING ERRCODE = 'unique_violation';
  END IF;

  UPDATE public.user_invitations i
     SET status = 'revoked', revoked_at = now(), revoked_by = auth.uid(),
         revoke_reason = 'Replaced by a newer invitation'
   WHERE lower(i.email) = v_email AND i.status = 'pending';

  v_token   := encode(extensions.gen_random_bytes(32), 'hex');
  v_expires := now() + make_interval(days => greatest(1, least(coalesce(p_valid_days, 7), 30)));

  INSERT INTO public.user_invitations (
    station_id, email, role, full_name, full_name_bn, phone,
    token_hash, expires_at, created_by
  ) VALUES (
    (SELECT s.id FROM public.stations s ORDER BY s.id LIMIT 1),
    v_email, p_role, btrim(p_full_name),
    nullif(btrim(coalesce(p_full_name_bn, '')), ''),
    nullif(btrim(coalesce(p_phone, '')), ''),
    encode(extensions.digest(v_token, 'sha256'), 'hex'),
    v_expires, auth.uid()
  )
  RETURNING id INTO v_id;

  RETURN QUERY SELECT v_id, v_token, v_expires;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.create_invitation(text, public.user_role, text, text, text, integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.create_invitation(text, public.user_role, text, text, text, integer) TO authenticated;

COMMENT ON FUNCTION public.create_invitation(text, public.user_role, text, text, text, integer) IS
  'SECURITY DEFINER: checks auth.users for an existing account, which no client role may read. Admin-only, and refuses any role but dispenser, manager or accountant.';
