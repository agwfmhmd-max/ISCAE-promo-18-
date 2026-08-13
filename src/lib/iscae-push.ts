import { buildPushPayload, type PushSubscription, type VapidKeys } from "@block65/webcrypto-web-push";

/** اشتراك جهاز كما هو مخزَّن في جدول push_subscriptions */
export type StoredPushSubscription = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

/** يقرأ مفاتيح VAPID من أسرار الخادم (تُقرأ داخل المعالج وليس في نطاق الوحدة) */
export function readVapidEnv(): VapidKeys | null {
  const publicKey = process.env["VAPID_PUBLIC_KEY"];
  const privateKey = process.env["VAPID_PRIVATE_KEY"];
  const subject = process.env["VAPID_SUBJECT"] || "mailto:admin@iscae.mr";
  if (!publicKey || !privateKey) return null;
  return { subject, publicKey, privateKey };
}

export type PushNotificationPayload = {
  id?: string | null;
  title: string;
  body: string;
  url?: string;
  icon?: string;
  badge?: string;
};

/**
 * إرسال إشعار Web Push واحد باستعمال Web Crypto فقط
 * (يعمل داخل بيئة الخادم Cloudflare — بدون Edge Functions وبدون مكتبة Node).
 */
export async function sendPushNotification(
  sub: StoredPushSubscription,
  payload: PushNotificationPayload,
  vapid: VapidKeys,
): Promise<"ok" | "gone" | "error"> {
  try {
    const subscription: PushSubscription = {
      endpoint: sub.endpoint,
      expirationTime: null,
      keys: { p256dh: sub.p256dh, auth: sub.auth },
    };

    const message = {
      data: JSON.stringify({
        id: payload.id ?? null,
        title: payload.title,
        body: payload.body,
        url: payload.url || "/site/index.html",
        icon: payload.icon || "/site/icon-192.png",
        badge: payload.badge || "/site/favicon-32.png",
      }),
      options: { ttl: 60 * 60 * 24, urgency: "high" as const },
    };

    const request = await buildPushPayload(message, subscription, vapid);
    const res = await fetch(sub.endpoint, {
      method: request.method,
      headers: request.headers as unknown as HeadersInit,
      body: request.body as unknown as BodyInit,
    });

    if (res.ok) return "ok";
    // 404/410 = اشتراك منتهٍ يجب حذفه (ليس فشلاً)
    if (res.status === 404 || res.status === 410) return "gone";
    return "error";
  } catch {
    return "error";
  }
}