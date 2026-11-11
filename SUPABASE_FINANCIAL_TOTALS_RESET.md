# مسح محتوى `promotion_financial_totals`

`promotion_financial_totals` هو **عرض View مشتق**، وليس جدولًا يمكن حذف صفوفه مباشرة. تُحسب القيم من `subscription_requests` و`financial_report_entries`.

لذلك أضيفت دالة إدارية لا تعمل من الموقع ولا من حسابات المستخدمين:

```sql
select public.supabase_clear_promotion_financial_totals('PROMOTION-UUID-HERE');
```

تشغّل الدالة من **Supabase Dashboard → SQL Editor** بصلاحية مالك المشروع فقط. وهي تقوم بالآتي للدفعة المحددة:

- حذف سجلات طلبات الاشتراك.
- حذف بنود التقارير المالية.
- إعادة الحسابات النشطة إلى `pending`.
- مسح ترتيب الدفع `payment_order_index`.
- جعل الملخص المالي الناتج يساوي صفرًا.

لم تُمنح الدالة صلاحية التنفيذ إلى `anon` أو `authenticated`، لذلك لا يمكن استدعاؤها من واجهة الموقع أو من حساب رئيس الدفعة.

قبل الاستخدام، تأكد من معرّف الدفعة:

```sql
select id, number, name_ar, name_fr
from public.promotions
order by number
limit 100;
```

هذا إجراء حذف شامل لمصادر الملخص المالي للدفعة، لذلك يجب تشغيله فقط عندما تريد بالفعل إزالة بيانات الاختبار أو البيانات المالية المرتبطة بتلك الدفعة.
