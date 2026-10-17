-- Indexed foreign-key checks and bounded retry-record cleanup as accounts grow.
create index user_favorites_show on public.user_favorites(show_id);
create index account_operations_expiry on app_private.account_operations(user_id, created_at);

-- An account that enrolled MFA must also prove it before destructive self-service.
create or replace function public.assert_account_deletion_allowed() returns boolean
language plpgsql security definer set search_path = '' as $$
declare uid uuid := app_private.require_account();
begin
  if exists(select 1 from public.user_roles where user_id = uid and role = 'admin') then
    raise exception 'Transfer the studio admin role before deleting this account.' using errcode = '42501';
  end if;
  if exists(select 1 from auth.mfa_factors where user_id = uid and status = 'verified')
    and coalesce((select auth.jwt())->>'aal', '') <> 'aal2' then
    raise exception 'Verify your authenticator before deleting your account.' using errcode = '42501';
  end if;
  if not exists(select 1 from jsonb_array_elements(coalesce((select auth.jwt())->'amr', '[]'::jsonb)) a
    where a->>'method' = 'password' and (a->>'timestamp')::bigint >= extract(epoch from now()) - 300) then
    raise exception 'Confirm your password again before deleting your account.' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text, 417));
  perform app_private.account_limit(uid, 'delete_hour', 5, 3600);
  return true;
end; $$;
revoke all on function public.assert_account_deletion_allowed() from public, anon;
grant execute on function public.assert_account_deletion_allowed() to authenticated;
