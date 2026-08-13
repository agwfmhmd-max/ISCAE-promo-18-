import { createFileRoute } from "@tanstack/react-router";
import { json } from "@/lib/iscae-server";
import { readVapidEnv } from "@/lib/iscae-push";

/**
 * المفتاح العمومي لـ VAPID فقط (ليس سرّاً) — تستعمله الواجهة
 * في PushManager.subscribe() حتى لا يبقى مكتوباً يدوياً داخل index.html.
 */
export const Route = createFileRoute("/api/public/push/vapid-key")({
  server: {
    handlers: {
      GET: () => {
        const vapid = readVapidEnv();
        return json({ publicKey: vapid ? vapid.publicKey : null });
      },
    },
  },
});