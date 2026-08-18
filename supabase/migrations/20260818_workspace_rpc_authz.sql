-- Personal workspace creation is intentionally available only to authenticated FloStudio users.
revoke execute on function public.ensure_personal_workspace() from anon;
grant execute on function public.ensure_personal_workspace() to authenticated;
