import { SUPABASE_URL } from "@/lib/iscae-config";

type Promotion = { id: string; domain?: string | null; graduate_roster_uploaded?: boolean; registration_mask?: string | null };
type Row = { id: string };

export type GraduateRegistrationCheck = {
  eligible: boolean;
  promotion?: Promotion;
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

  const queryRows = async (table: "graduate_accounts" | "students"): Promise<Row[] | null> => {
    const url = new URL(`${SUPABASE_URL}/rest/v1/${table}`);
    url.searchParams.set("select", "id");
    url.searchParams.set("promotion_id", `eq.${promotionId}`);
    url.searchParams.set("registration_number", `ilike.${registration}`);
    url.searchParams.set("limit", "1");
    const response = await fetch(url, { headers, cache: "no-store" });
    if (!response.ok) return null;
    return await response.json() as Row[];
  };

  const existingAccounts = await queryRows("graduate_accounts");
  if (!existingAccounts) return { eligible: false, promotion, error: "upstream" };
  if (existingAccounts.length) return { eligible: false, promotion };
  if (promotion.graduate_roster_uploaded) {
    const officialStudents = await queryRows("students");
    if (!officialStudents) return { eligible: false, promotion, error: "upstream" };
    if (!officialStudents.length) return { eligible: false, promotion };
  }
  return { eligible: true, promotion };
}
