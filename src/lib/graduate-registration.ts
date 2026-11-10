import { SUPABASE_URL } from "@/lib/iscae-config";

type Promotion = { id: string; domain?: string | null; graduate_roster_uploaded?: boolean; registration_mask?: string | null };
type Row = { id: string; full_name?: string | null | undefined; full_name_fr?: string | null | undefined; registration_number?: string | null | undefined; specialty_id?: string | null | undefined; specialty_name?: string | null | undefined; specialty_name_fr?: string | null | undefined };

export type GraduateRegistrationCheck = {
  eligible: boolean;
  promotion?: Promotion;
  student?: Row;
  error?: string;
};

export async function checkGraduateRegistration(
  promotionId: string,
  registrationNumber: string,
  serviceKey: string,
): Promise<GraduateRegistrationCheck> {
  const registration = registrationNumber.trim().toUpperCase();
  if (!/^[A-Z0-9-]{1,64}$/.test(registration)) return { eligible: false };
  const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };
  const promotionUrl = new URL(`${SUPABASE_URL}/rest/v1/promotions`);
  promotionUrl.searchParams.set("select", "id,domain,graduate_roster_uploaded,registration_mask");
  promotionUrl.searchParams.set("id", `eq.${promotionId}`);
  promotionUrl.searchParams.set("limit", "1");
  const promotionResponse = await fetch(promotionUrl, { headers, cache: "no-store" });
  if (!promotionResponse.ok) return { eligible: false, error: "upstream" };
  const promotions = await promotionResponse.json() as Promotion[];
  const promotion = promotions[0];
  if (!promotion) return { eligible: false };

  if (!promotion.graduate_roster_uploaded) {
    let mask = String(promotion.registration_mask ?? "").trim().toUpperCase();
    if (!(mask.length >= 2 && mask.length <= 32 && /^[A-Z0-9#-]+$/.test(mask) && mask.includes("#"))) mask = "I#####";
    const pattern = new RegExp(`^${mask.replace(/#/g, "[0-9]")}$`);
    if (!pattern.test(registration)) return { eligible: false, promotion };
  }

  const accountUrl = new URL(`${SUPABASE_URL}/rest/v1/graduate_accounts`);
  accountUrl.searchParams.set("select", "id"); accountUrl.searchParams.set("promotion_id", `eq.${promotionId}`); accountUrl.searchParams.set("registration_number", `ilike.${registration}`); accountUrl.searchParams.set("limit", "1");
  const existingResponse = await fetch(accountUrl, { headers, cache: "no-store" });
  if (!existingResponse.ok) return { eligible: false, promotion, error: "upstream" };
  if ((await existingResponse.json() as Row[]).length) return { eligible: false, promotion };

  if (!promotion.graduate_roster_uploaded) return { eligible: true, promotion };
  const studentUrl = new URL(`${SUPABASE_URL}/rest/v1/students`);
  studentUrl.searchParams.set("select", "id,full_name,full_name_fr,registration_number,specialty_id,specialties(name,name_fr)");
  studentUrl.searchParams.set("promotion_id", `eq.${promotionId}`);
  studentUrl.searchParams.set("registration_number", `ilike.${registration}`);
  studentUrl.searchParams.set("limit", "1");
  const studentResponse = await fetch(studentUrl, { headers, cache: "no-store" });
  if (!studentResponse.ok) return { eligible: false, promotion, error: "upstream" };
  const students = await studentResponse.json() as Array<Row & { specialties?: { name?: string; name_fr?: string } | null }>;
  const row = students[0];
  if (!row) return { eligible: false, promotion };
  const student: Row = { id: row.id, full_name: row.full_name, full_name_fr: row.full_name_fr, registration_number: row.registration_number, specialty_id: row.specialty_id, specialty_name: row.specialties?.name, specialty_name_fr: row.specialties?.name_fr };
  return { eligible: true, promotion, student };
}
