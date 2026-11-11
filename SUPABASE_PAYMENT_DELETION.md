# حذف سجل دفع مقبول من Supabase فقط

هذا الإجراء غير موجود في واجهة الموقع وغير متاح للمستخدمين أو لمسؤولي الدفعة عبر التطبيق. يتم تشغيله من **Supabase Dashboard → SQL Editor** بصلاحية مالك المشروع/`postgres` فقط.

```sql
select public.supabase_delete_approved_subscription('PUT-REQUEST-UUID-HERE');
```

قبل التنفيذ، احصل على `id` للطلب المطلوب من جدول `subscription_requests`، وتحقق من أنه `status = 'approved'`:

```sql
select id, promotion_id, account_id, status, amount, reviewed_at
from public.subscription_requests
where status = 'approved'
order by reviewed_at desc
limit 100;
```

الإجراء يرفض حذف أي طلب غير مقبول، ويحذف سجل الطلب المقبول فقط. إذا لم يبقَ للحساب طلب مقبول آخر، تعاد حالة عضويته إلى `pending`. بعد ذلك يعاد بناء ترتيب الدفع للدفعة، لذلك لا يبقى رقم دفع قديم أو فجوة ناتجة عن الحذف.

لا تمنح صلاحية `execute` على الدالة إلى `anon` أو `authenticated`؛ migration المنشورة تسحب هذه الصلاحيات عمدًا.
