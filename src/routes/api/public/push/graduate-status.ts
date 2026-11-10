import { createFileRoute } from "@tanstack/react-router";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/iscae-config";
import { authenticateCaller, json, serverEnv } from "@/lib/iscae-server";
import {
  assertVapidUsable,
  endpointLabel,
  readVapidEnv,
  sendPushNotification,
  type StoredPushSubscription,
} from "@/lib/iscae-push";

type Body = { promotion_id?: unknown; request_id?: unknown };
type ReviewedRequest = {
  id: string;
  promotion_id: string;
  account_id: string;
  status: "approved" | "rejected";
  reviewed_at: string | null;
  rejection_reason: string | null;
};
type GraduateAccount = { user_id: string };
type GraduateNotification = { id: string; title: string; body: string; url: string | null };
type TargetSubscription = StoredPushSubscription & { lang: string | null };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function restHeaders(key: string, extra: Record<string, string> = {}) {
  return { apikey: key, Authorization: `Bearer ${key}`, ...extra };
}

async function selectRows<T>(
  table: string,
  query: URLSearchParams,
  headers: Record<string, string>,
): Promise<T[] | null> {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query.toString()}`, {
    headers,
    cache: "no-store",
  });
  if (!response.ok) return null;
  return (await response.json()) as T[];
}

export const Route = createFileRoute("/api/public/push/graduate-status")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await authenticateCaller(request);
        if ("error" in auth) return auth.error;

        let body: Body;
        try {
          body = (await request.json()) as Body;
        } catch {
          return json({ ok: false, error: "INVALID_REQUEST" }, 400);
        }
        const promotionId = String(body.promotion_id ?? "").trim();
        const requestId = String(body.request_id ?? "").trim();
        if (!UUID_RE.test(promotionId) || !UUID_RE.test(requestId)) {
          return json({ ok: false, error: "INVALID_REQUEST" }, 400);
        }

        // Keep this route available to the batch head, platform admin, and assigned finance only.
        const permission = await fetch(`${SUPABASE_URL}/rest/v1/rpc/can_manage_graduate_role`, {
          method: "POST",
          headers: {
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${auth.token}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({ _promotion_id: promotionId, _role: "finance" }),
          cache: "no-store",
        });
        if (!permission.ok || (await permission.json()) !== true)
          return json({ ok: false, error: "FORBIDDEN" }, 403);

        const serviceKey =
          serverEnv("SUPABASE_SERVICE_ROLE_KEY") ?? serverEnv("SUPABASE_SERVICE_KEY");
        if (!serviceKey) return json({ ok: false, error: "PUSH_SERVICE_UNAVAILABLE" }, 503);
        const headers = restHeaders(serviceKey);

        const requestQuery = new URLSearchParams({
          select: "id,promotion_id,account_id,status,reviewed_at,rejection_reason",
          id: `eq.${requestId}`,
          promotion_id: `eq.${promotionId}`,
          limit: "1",
        });
        const reviewed = (
          await selectRows<ReviewedRequest>("subscription_requests", requestQuery, headers)
        )?.[0];
        if (
          !reviewed ||
          !["approved", "rejected"].includes(reviewed.status) ||
          !reviewed.reviewed_at
        ) {
          return json({ ok: false, error: "REVIEWED_REQUEST_NOT_FOUND" }, 404);
        }

        const accountQuery = new URLSearchParams({
          select: "user_id",
          id: `eq.${reviewed.account_id}`,
          promotion_id: `eq.${promotionId}`,
          limit: "1",
        });
        const account = (
          await selectRows<GraduateAccount>("graduate_accounts", accountQuery, headers)
        )?.[0];
        if (!account?.user_id) return json({ ok: false, error: "GRADUATE_ACCOUNT_NOT_FOUND" }, 404);

        const notificationQuery = new URLSearchParams({
          select: "id,title,body,url",
          promotion_id: `eq.${promotionId}`,
          user_id: `eq.${account.user_id}`,
          created_at: `gte.${reviewed.reviewed_at}`,
          order: "created_at.desc",
          limit: "1",
        });
        const notification = (
          await selectRows<GraduateNotification>(
            "graduate_notifications",
            notificationQuery,
            headers,
          )
        )?.[0];
        if (!notification) return json({ ok: false, error: "STATUS_NOTIFICATION_NOT_FOUND" }, 404);

        const subscriptionQuery = new URLSearchParams({
          select: "id,endpoint,p256dh,auth,lang",
          user_id: `eq.${account.user_id}`,
          promotion_id: `eq.${promotionId}`,
          is_active: "eq.true",
          limit: "500",
        });
        const subscriptions = await selectRows<TargetSubscription>(
          "push_subscriptions",
          subscriptionQuery,
          headers,
        );
        if (subscriptions === null)
          return json({ ok: false, error: "PUSH_SUBSCRIPTIONS_UNAVAILABLE" }, 503);
        if (!subscriptions.length) return json({ ok: true, total: 0, sent: 0, failed: 0 });

        const vapid = await readVapidEnv();
        if (!vapid)
          return json(
            {
              ok: false,
              error: "PUSH_CONFIGURATION_UNAVAILABLE",
              total: subscriptions.length,
              sent: 0,
            },
            503,
          );
        try {
          await assertVapidUsable(vapid);
        } catch (error) {
          console.error(
            "[Push] invalid VAPID keys for graduate status:",
            error instanceof Error ? error.message : "unknown",
          );
          return json(
            {
              ok: false,
              error: "PUSH_CONFIGURATION_UNAVAILABLE",
              total: subscriptions.length,
              sent: 0,
            },
            503,
          );
        }

        const origin = new URL(request.url).origin;
        const isFrench = (subscription: TargetSubscription) =>
          subscription.lang?.toLowerCase().startsWith("fr");
        const rejectedReason = reviewed.rejection_reason?.trim();
        const goneIds: string[] = [];
        let sent = 0;
        let failed = 0;
        for (let offset = 0; offset < subscriptions.length; offset += 10) {
          const batch = subscriptions.slice(offset, offset + 10);
          const results = await Promise.all(
            batch.map(async (subscription) => {
              const french = isFrench(subscription);
              const title =
                reviewed.status === "approved"
                  ? french
                    ? "Adhésion approuvée"
                    : "تم قبول الاشتراك"
                  : french
                    ? "Mise à jour de votre adhésion"
                    : "تحديث طلب الاشتراك";
              const message =
                reviewed.status === "approved"
                  ? french
                    ? "Votre paiement a été vérifié et votre adhésion est activée."
                    : notification.body
                  : french
                    ? `Votre paiement a été refusé.${rejectedReason ? ` Motif : ${rejectedReason}` : ""}`
                    : notification.body;
              const result = await sendPushNotification(
                subscription,
                {
                  id: notification.id,
                  title,
                  body: message,
                  lang: french ? "fr" : "ar",
                  url: new URL("/site/index.html?graduate=1", origin).toString(),
                },
                vapid,
              );
              return { subscription, result };
            }),
          );
          for (const { subscription, result } of results) {
            if (result.outcome === "ok") sent += 1;
            else if (result.outcome === "gone") goneIds.push(subscription.id);
            else failed += 1;
          }
        }

        if (goneIds.length) {
          const deleteQuery = new URLSearchParams({ id: `in.(${goneIds.join(",")})` });
          const deleteResponse = await fetch(
            `${SUPABASE_URL}/rest/v1/push_subscriptions?${deleteQuery.toString()}`,
            {
              method: "DELETE",
              headers: { ...headers, Prefer: "return=minimal" },
            },
          );
          if (!deleteResponse.ok)
            console.error("[Push] unable to remove expired graduate notification subscriptions");
        }

        console.log(
          `[Push] graduate status promotion=${promotionId} devices=${subscriptions.length} sent=${sent} failed=${failed} expired=${goneIds.length}${subscriptions[0] ? ` endpoint=${endpointLabel(subscriptions[0].endpoint)}` : ""}`,
        );
        return json(
          { ok: failed === 0, total: subscriptions.length, sent, failed, removed: goneIds.length },
          failed === subscriptions.length ? 502 : 200,
        );
      },
    },
  },
});
