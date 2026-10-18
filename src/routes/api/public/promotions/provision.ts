import { createFileRoute } from "@tanstack/react-router";
import { authenticateCaller, isGlobalSupervisor, json } from "@/lib/iscae-server";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/iscae-config";

type VercelProject = {
  id: string;
  name: string;
  framework?: string | null;
  buildCommand?: string | null;
  devCommand?: string | null;
  installCommand?: string | null;
  outputDirectory?: string | null;
  rootDirectory?: string | null;
  link?: {
    type?: string;
    repo?: string;
    org?: string;
    repoId?: string | number;
    productionBranch?: string;
  } | null;
};
type VercelEnv = {
  id?: string;
  key: string;
  value?: string;
  type?: string;
  target?: string[];
  gitBranch?: string | null;
  customEnvironmentIds?: string[];
};

async function serverEnv(name: string): Promise<string | undefined> {
  const root = globalThis as unknown as Record<string, unknown>;
  const candidates: unknown[] = [
    typeof process !== "undefined" ? process.env : undefined,
    root["__env__"], root["env"],
    (root["process"] as { env?: unknown } | undefined)?.env,
  ];
  for (const source of candidates) {
    if (source && typeof source === "object") {
      const value = (source as Record<string, unknown>)[name];
      if (typeof value === "string" && value.trim()) return value.trim();
    }
  }
  try {
    const specifier = "cloudflare:workers";
    const module = await import(/* @vite-ignore */ specifier) as { env?: Record<string, string | undefined> };
    const value = module.env?.[name];
    if (typeof value === "string" && value.trim()) return value.trim();
  } catch { /* environment not available in this runtime */ }
  return undefined;
}

function teamQuery(teamId: string) { return `?teamId=${encodeURIComponent(teamId)}`; }
async function vercelFetch(path: string, token: string, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${token}`);
  headers.set("content-type", "application/json");
  return fetch(`https://api.vercel.com${path}`, {
    ...init,
    headers,
  });
}
async function apiError(response: Response, operation: string): Promise<Error> {
  const text = (await response.text().catch(() => "")).slice(0, 300);
  return new Error(`${operation} failed (${response.status})${text ? `: ${text}` : ""}`);
}
async function updatePromotionStatus(promotionId: string, status: "ready" | "error", userToken: string) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/promotions?id=eq.${encodeURIComponent(promotionId)}`, {
    method: "PATCH",
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${userToken}`,
      "content-type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({ domain_status: status, updated_at: new Date().toISOString() }),
  });
  if (!response.ok) console.error("[Promotion provisioning] Could not update promotion status:", response.status);
}

async function provisionProject(promotion: { id: string; promotion_number: number; slug: string }, token: string, teamId: string, templateId: string) {
  const team = teamQuery(teamId);
  const templateResponse = await vercelFetch(`/v9/projects/${encodeURIComponent(templateId)}${team}`, token);
  if (!templateResponse.ok) throw await apiError(templateResponse, "Reading template project");
  const template = await templateResponse.json() as VercelProject;
  if (!template.id || !template.link?.repo || !template.link.type) {
    throw new Error("The Vercel template project must be linked to a Git repository.");
  }
  const repository = template.link.repo.includes("/")
    ? template.link.repo
    : (template.link.org ? `${template.link.org}/${template.link.repo}` : template.link.repo);

  const targetName = promotion.slug;
  let project: VercelProject;
  const existingResponse = await vercelFetch(`/v9/projects/${encodeURIComponent(targetName)}${team}`, token);
  if (existingResponse.ok) {
    project = await existingResponse.json() as VercelProject;
  } else if (existingResponse.status === 404) {
    const body = {
      name: targetName,
      ...(template.framework ? { framework: template.framework } : {}),
      ...(template.buildCommand ? { buildCommand: template.buildCommand } : {}),
      ...(template.devCommand ? { devCommand: template.devCommand } : {}),
      ...(template.installCommand ? { installCommand: template.installCommand } : {}),
      ...(template.outputDirectory ? { outputDirectory: template.outputDirectory } : {}),
      ...(template.rootDirectory ? { rootDirectory: template.rootDirectory } : {}),
      gitRepository: { type: template.link.type, repo: repository },
    };
    const createResponse = await vercelFetch(`/v11/projects${team}`, token, { method: "POST", body: JSON.stringify(body) });
    if (!createResponse.ok) throw await apiError(createResponse, "Creating Vercel project");
    project = await createResponse.json() as VercelProject;
  } else {
    throw await apiError(existingResponse, "Checking Vercel project");
  }
  if (!project.id) throw new Error("Vercel returned no project id.");

  const envResponse = await vercelFetch(`/v10/projects/${encodeURIComponent(template.id)}/env?decrypt=true&teamId=${encodeURIComponent(teamId)}`, token);
  if (!envResponse.ok) throw await apiError(envResponse, "Reading template environment variables");
  const envPayload = await envResponse.json() as { envs?: VercelEnv[] } | VercelEnv[];
  const templateEnvs = Array.isArray(envPayload) ? envPayload : (envPayload.envs || []);
  const targetEnvResponse = await vercelFetch(`/v10/projects/${encodeURIComponent(project.id)}/env?teamId=${encodeURIComponent(teamId)}`, token);
  if (!targetEnvResponse.ok) throw await apiError(targetEnvResponse, "Reading target environment variables");
  const targetPayload = await targetEnvResponse.json() as { envs?: VercelEnv[] } | VercelEnv[];
  const targetEnvs = Array.isArray(targetPayload) ? targetPayload : (targetPayload.envs || []);
  const existingKeys = new Set(targetEnvs.map((entry) => `${entry.key}:${(entry.target || []).slice().sort().join(",")}`));

  for (const entry of templateEnvs) {
    if (!entry.key || typeof entry.value !== "string") continue;
    // لا تنقل رمز الإدارة إلى نسخ الدفعات، حتى لا تتوسع صلاحيات أي تطبيق منشور.
    if (entry.key.toUpperCase().startsWith("VERCEL_") || entry.key.toUpperCase() === "SUPABASE_SERVICE_ROLE_KEY") continue;
    const target = entry.target?.length ? entry.target : ["production", "preview", "development"];
    const dedupeKey = `${entry.key}:${target.slice().sort().join(",")}`;
    if (existingKeys.has(dedupeKey)) continue;
    const type = entry.type === "plain" ? "plain" : "encrypted";
    const copy = {
      key: entry.key,
      value: entry.value,
      type,
      target,
      ...(entry.gitBranch ? { gitBranch: entry.gitBranch } : {}),
      ...(entry.customEnvironmentIds?.length ? { customEnvironmentIds: entry.customEnvironmentIds } : {}),
    };
    const addResponse = await vercelFetch(`/v10/projects/${encodeURIComponent(project.id)}/env${team}`, token, {
      method: "POST", body: JSON.stringify(copy),
    });
    if (!addResponse.ok) throw await apiError(addResponse, `Copying environment variable ${entry.key}`);
    existingKeys.add(dedupeKey);
  }
  return { projectId: project.id, projectName: project.name || targetName, domain: `${targetName}.vercel.app` };
}

export const Route = createFileRoute("/api/public/promotions/provision")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await authenticateCaller(request);
        if ("error" in auth) return auth.error;
        if (!isGlobalSupervisor(auth.caller)) return json({ ok: false, error: "هذه العملية للمشرف العام فقط." }, 403);

        let body: { promotion_id?: unknown };
        try { body = await request.json() as { promotion_id?: unknown }; }
        catch { return json({ ok: false, error: "طلب غير صالح." }, 400); }
        const promotionId = String(body.promotion_id || "").trim();
        if (!/^[0-9a-f-]{36}$/i.test(promotionId)) return json({ ok: false, error: "معرف الدفعة غير صالح." }, 400);

        const [token, teamId, templateId] = await Promise.all([
          serverEnv("VERCEL_TOKEN"), serverEnv("VERCEL_TEAM_ID"), serverEnv("VERCEL_TEMPLATE_PROJECT_ID"),
        ]);
        if (!token || !teamId || !templateId) {
          return json({
            ok: false,
            configured: false,
            pending: true,
            error: "يلزم إعداد VERCEL_TOKEN وVERCEL_TEAM_ID وVERCEL_TEMPLATE_PROJECT_ID في أسرار خادم Vercel.",
          }, 202);
        }

        const promoResponse = await fetch(`${SUPABASE_URL}/rest/v1/promotions?id=eq.${encodeURIComponent(promotionId)}&select=id,promotion_number,slug&limit=1`, {
          headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${auth.token}` },
        });
        if (!promoResponse.ok) return json({ ok: false, error: "تعذر قراءة بيانات الدفعة." }, 400);
        const promotions = await promoResponse.json() as Array<{ id: string; promotion_number: number; slug: string }>;
        const promotion = promotions[0];
        if (!promotion) return json({ ok: false, error: "الدفعة غير موجودة." }, 404);

        try {
          const result = await provisionProject(promotion, token, teamId, templateId);
          await updatePromotionStatus(promotionId, "ready", auth.token);
          return json({ ok: true, configured: true, ...result });
        } catch (error) {
          await updatePromotionStatus(promotionId, "error", auth.token);
          const message = error instanceof Error ? error.message : "Vercel provisioning failed.";
          console.error("[Promotion provisioning]", message);
          return json({ ok: false, configured: true, error: message }, 502);
        }
      },
    },
  },
});
