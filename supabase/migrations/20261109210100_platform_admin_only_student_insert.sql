begin;

-- Remove permissive policies that allowed batch admins and department admins
-- to insert students. Updates/deletes remain governed by their existing policies.
drop policy if exists students_dept_insert on public.students;
drop policy if exists students_super_all on public.students;
drop policy if exists mp_scope_insert on public.students;
create policy mp_scope_insert on public.students for insert to authenticated
with check (mp_can_write(promotion_id) and is_platform_admin());

commit;
