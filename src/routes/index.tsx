import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";

export const Route = createFileRoute("/")({
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
    ],
  }),
  component: Index,
});

/** الموقع الحقيقي (ملف واحد ثابت) يُخدَم من public/site/index.html */
function Index() {
  useEffect(() => {
    window.location.replace("/site/index.html");
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <a href="/site/index.html" className="text-sm font-medium text-primary underline">
        ISCAE 18ème Promotion
      </a>
    </div>
  );
}
