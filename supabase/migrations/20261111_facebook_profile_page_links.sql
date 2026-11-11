-- Accept literal user-supplied numeric profile shortcuts without broadening Page URL access.
-- Existing no-query paths remain valid; controls cannot exploit an end-of-line regex match.
begin;

create or replace function public.facebook_daily_page_url(p_url text)
returns text language sql immutable security definer set search_path = '' as $$
  select case when length(p_url) <= 2000 and p_url !~ '[[:cntrl:]]' and (
    (p_url ~ '^https://(www\.)?facebook\.com/[A-Za-z0-9._~/-]+$'
      and p_url !~ '(^|/)\.{1,2}(/|$)')
    or p_url ~ '^https://(www\.)?facebook\.com/profile\.php\?id=[1-9][0-9]{0,24}$'
  ) then p_url end
$$;

revoke all on function public.facebook_daily_page_url(text) from public,anon,authenticated,service_role;

commit;
