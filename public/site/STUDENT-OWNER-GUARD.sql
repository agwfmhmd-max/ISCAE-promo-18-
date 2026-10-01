-- =============================================================================
-- STUDENT-OWNER-GUARD.sql — حماية على مستوى قاعدة البيانات:
-- رئيس التخصص لا يستطيع تعديل/حذف طالب أضافه مشرف آخر (حتى لو تجاوز واجهة الموقع).
-- المشرف الرئيسي: كل الصلاحيات.  طلاب بلا مُنشئ (created_by فارغ) يبقون قابلين للتعديل كما كانوا.
-- Supabase ▸ SQL Editor ▸ الصق الملف ▸ Run  (آمن للتكرار، لا يمسّ البيانات).
-- يتطلب: public.is_super_admin() وعمود students.created_by (يسجّله الموقع عند كل إضافة).
-- السياسات من نوع RESTRICTIVE: تُضاف فوق السياسات الحالية ولا تستبدلها.
-- للتراجع:  drop policy "students_owner_update_guard" on public.students;
--           drop policy "students_owner_delete_guard" on public.students;
-- =============================================================================
do $$
begin
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'students' and column_name = 'created_by') then
    raise notice 'العمود students.created_by غير موجود — لم تُنشأ السياسات.';
    return;
  end if;

  drop policy if exists "students_owner_update_guard" on public.students;
  create policy "students_owner_update_guard" on public.students
    as restrictive for update to authenticated
    using      (public.is_super_admin() or created_by is null or created_by = auth.uid())
    with check (public.is_super_admin() or created_by is null or created_by = auth.uid());

  drop policy if exists "students_owner_delete_guard" on public.students;
  create policy "students_owner_delete_guard" on public.students
    as restrictive for delete to authenticated
    using (public.is_super_admin() or created_by is null or created_by = auth.uid());
end $$;
