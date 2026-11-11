begin;

-- Category helpers are called internally by SECURITY DEFINER search/stat functions.
-- They accept arbitrary promotion IDs, so direct public execution would expose another
-- promotion's configured capacities. Keep execution to trusted function owners/service role.
revoke execute on function public.student_category(integer, uuid) from public, anon, authenticated;
revoke execute on function public.student_category(integer) from public, anon, authenticated;

grant execute on function public.student_category(integer, uuid) to service_role;
grant execute on function public.student_category(integer) to service_role;

commit;
