import { createFileRoute } from "@tanstack/react-router";
import { authenticateCaller, isSuperAdmin, json } from "@/lib/iscae-server";
import { readVapidEnv, sendPushNotification, type StoredPushSubscription } from "@/lib/iscae-push";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/iscae-config";

const MAX_TITLE = 120;
const MAX_BODY = 500;
const CONCURRENCY = 25;

type NotificationRow = { id: string };

function restHeaders(token: string, extra: Record<string, string> = {}) {
  return { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}`, ...extra };
}

/** تسجيل الإشعار (يُشغّل أيضاً الإشعار الداخلي الفوري عبر Realtime) */
async function insertNotification(
  row: { title: string; body: string; url: string | null; created_by: string | null },
  token: string,
): Promise<NotificationRow | null> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/notifications`, {
    method: "POST",
    headers: restHeaders(token, { "content-type": "application/json", Prefer: "return=representation" }),
    body: JSON.stringify(row),
  });
  if (!res.ok) return null;
  const rows = (await res.json()) as NotificationRow[];
  return rows[0] ?? null;
}

async function updateNotificationStats(
  id: string,
  stats: { success_count: number; failure_count: number },
  token: string,
): Promise<void> {
  await fetch(`${SUPABASE_URL}/rest/v1/notifications?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: restHeaders(token, { "content-type": "application/json", Prefer: "return=minimal" }),
    body: JSON.stringify({ ...stats, sent_at: new Date().toISOString() }),
  }).catch(() => null);
}

/** كل الأجهزة المفعّلة (القراءة مسموحة للمشرف الرئيسي فقط بحسب RLS) */
async function fetchActiveSubscriptions(token: string): Promise<StoredPushSubscription[]> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_active_push_subscriptions`, {
    method: "POST",
    headers: restHeaders(token, { "content-type": "application/json" }),
    body: "{}",
  });
  if (!res.ok) {
    console.error("[Push] get_active_push_subscriptions failed:", res.status, await res.text().catch(() => ""));
    return [];
  }
  return (await res.json()) as StoredPushSubscription[];
}

async function deleteSubscriptions(ids: string[], token: string): Promise<void> {
  if (ids.length === 0) return;
  await fetch(`${SUPABASE_URL}/rest/v1/rpc/delete_push_subscriptions`, {
    method: "POST",
    headers: restHeaders(token, { "content-type": "application/json" }),
    body: JSON.stringify({ p_ids: ids }),
  }).catch(() => null);
}

/** إرسال على دفعات صغيرة لتفادي إغراق الشبكة */
async function sendInBatches(
  subs: StoredPushSubscription[],
  payload: { id: string | null; title: string; body: string; url?: string },
  vapid: NonNullable<ReturnType<typeof readVapidEnv>>,
): Promise<{ delivered: number; failed: number; goneIds: string[] }> {
  let delivered = 0;
  let failed = 0;
  const goneIds: string[] = [];

  for (let i = 0; i < subs.length; i += CONCURRENCY) {
    const batch = subs.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      batch.map(async (sub) => ({ sub, outcome: await sendPushNotification(sub, payload, vapid) })),
    );
    for (const { sub, outcome } of results) {
      if (outcome === "ok") delivered += 1;
      else if (outcome === "gone") goneIds.push(sub.id);
      else failed += 1;
    }
  }

  return { delivered, failed, goneIds };
}

/**
 * إرسال إشعار من المشرف الرئيسي إلى كل الأجهزة المفعّلة.
 * لا يعتمد على Edge Functions ولا على Node — كل شيء داخل خادم الموقع نفسه.
 */
export const Route = createFileRoute("/api/public/push/send")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await authenticateCaller(request);
        if ("error" in auth) return auth.error;
        const { caller, token } = auth;

        if (!isSuperAdmin(caller)) {
          return json({ error: "❌ إرسال الإشعارات متاح للمشرف الرئيسي فقط." }, 403);
        }

        const vapid = readVapidEnv();
        if (!vapid) {
          return json({ error: "❌ إعدادات الإشعارات (VAPID) غير مكتملة على الخادم." }, 500);
        }

        let payload: Record<string, unknown>;
        try {
          payload = (await request.json()) as Record<string, unknown>;
        } catch {
          return json({ error: "❌ طلب غير صالح." }, 400);
        }

        const title = String(payload["title"] ?? "").trim().slice(0, MAX_TITLE);
        const body = String(payload["body"] ?? "").trim().slice(0, MAX_BODY);
        const rawUrl = String(payload["url"] ?? "").trim().slice(0, 500);
        if (!title || !body) return json({ error: "❌ العنوان والنص مطلوبان." }, 400);

        const urlOk =
          !rawUrl || /^https?:\/\//i.test(rawUrl) || rawUrl.startsWith("./") || rawUrl.startsWith("#");
        const url = urlOk && rawUrl ? rawUrl : null;

        const notif = await insertNotification(
          { title, body, url, created_by: caller.admin ? caller.admin.id : null },
          token,
        );

        const subs = await fetchActiveSubscriptions(token);
        if (subs.length === 0) {
          if (notif) await updateNotificationStats(notif.id, { success_count: 0, failure_count: 0 }, token);
          return json({
            ok: true,
            id: notif ? notif.id : null,
            sent: 0,
            failed: 0,
            removed: 0,
            message: "لا يوجد مشتركون في الإشعارات حالياً.",
          });
        }

        const { delivered, failed, goneIds } = await sendInBatches(
          subs,
          { id: notif ? notif.id : null, title, body, ...(url ? { url } : {}) },
          vapid,
        );

        await deleteSubscriptions(goneIds, token);
        if (notif) {
          await updateNotificationStats(
            notif.id,
            { success_count: delivered, failure_count: failed },
            token,
          );
        }

        return json({
          ok: true,
          id: notif ? notif.id : null,
          sent: delivered,
          failed,
          removed: goneIds.length,
        });
      },
    },
  },
});