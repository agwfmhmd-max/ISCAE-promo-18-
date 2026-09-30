import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect } from "react";

const SITE_URL = "/site/index.html";

export const Route = createFileRoute("/")({
  // التحويل من الخادم مباشرة (HTTP redirect) — لا يعتمد على تشغيل JavaScript
  // ولا على اكتمال hydration، فلا تبقى الصفحة عالقة على رابط «ISCAE 18ème Promotion».
  beforeLoad: () => {
    throw redirect({ href: SITE_URL, statusCode: 302 });
  },
  head: () => ({
    meta: [
      { title: "ISCAE 18ème Promotion — منصة حفل التخرج" },
      {
        name: "description",
        content:
          "منصة ISCAE للدفعة 18: البحث عن الخريجين، متابعة حفل توزيع شهادات التكريم، وإشعارات المشرف الرئيسي.",
      },
      { property: "og:title", content: "ISCAE 18ème Promotion — منصة حفل التخرج" },
      {
        property: "og:description",
        content: "ابحث عن معلوماتك كخريج وتابع استعدادات حفل توزيع شهادات التكريم.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      // احتياط 1: تحويل من المتصفح دون JavaScript
      { httpEquiv: "refresh", content: `0;url=${SITE_URL}` },
    ],
    // احتياط 2: تحويل فوري بسكربت مضمَّن في <head> قبل تحميل حزمة React
    scripts: [{ children: `window.location.replace(${JSON.stringify(SITE_URL)});` }],
  }),
  component: Index,
});

/** الموقع الحقيقي (ملف واحد ثابت) يُخدَم من public/site/index.html */
function Index() {
  useEffect(() => {
    window.location.replace(SITE_URL);
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <a href={SITE_URL} className="text-sm font-medium text-primary underline">
        ISCAE 18ème Promotion
      </a>
    </div>
  );
}
