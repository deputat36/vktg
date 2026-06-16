import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const H = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const URL = Deno.env.get("SUPABASE_URL") || "";
const SRK = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const ANON = Deno.env.get("SUPABASE_ANON_KEY") || "";
const REDIRECT = "https://deputat36.github.io/vktg/nav-accept-invite-v2.html";

function out(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...H, "Content-Type": "application/json" } });
}
function cleanEmail(v: unknown) { return String(v || "").trim().toLowerCase(); }
function cleanText(v: unknown) { return String(v || "").trim(); }
function msg(e: unknown) { return e instanceof Error ? e.message : String(e || "Unknown error"); }

function makeTemporaryPassword() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let raw = "";
  for (const byte of bytes) raw += byte.toString(36);
  return `${raw.slice(0, 28)}Aa1!`;
}

async function currentAdmin(userClient: any, adminClient: any) {
  const { data, error } = await userClient.auth.getUser();
  if (error || !data?.user?.id) throw new Error("Сессия администратора устарела. Выйдите и войдите заново.");
  const { data: profile, error: pErr } = await adminClient
    .from("nav_user_profiles")
    .select("id, role, is_active")
    .eq("id", data.user.id)
    .eq("is_active", true)
    .single();
  if (pErr || !profile) throw new Error("У текущего пользователя нет активного профиля Навигатора.");
  if (!["owner", "admin"].includes(profile.role)) throw new Error("Доступно только owner/admin Навигатора.");
  return data.user.id;
}

async function findAuthUser(adminClient: any, email: string) {
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error("Auth listUsers: " + error.message);
    const users = data?.users || [];
    const found = users.find((u: any) => cleanEmail(u.email) === email);
    if (found) return found;
    if (users.length < 1000) break;
  }
  return null;
}

async function saveProfile(adminClient: any, id: string, email: string, fullName: string, phone: string | null, role: string, invitedBy: string) {
  const { error } = await adminClient.from("nav_user_profiles").upsert({
    id,
    email,
    full_name: fullName || email,
    phone,
    role,
    is_active: true,
    invited_by: invitedBy,
    updated_at: new Date().toISOString(),
  }, { onConflict: "id" });
  if (error) throw new Error("nav_user_profiles: " + error.message);
}

async function createRecoveryLink(adminClient: any, email: string) {
  const { data, error } = await adminClient.auth.admin.generateLink({
    type: "recovery",
    email,
    options: { redirectTo: REDIRECT },
  });
  if (error) throw new Error("Ссылка установки пароля не создана: " + error.message);
  return data?.properties?.action_link || null;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: H });
  if (req.method !== "POST") return out({ error: "Method not allowed" }, 405);

  try {
    if (!URL || !SRK || !ANON) return out({ error: "Edge Function не настроена: нет переменных Supabase." }, 500);

    const authHeader = req.headers.get("Authorization") || "";
    const userClient = createClient(URL, ANON, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } });
    const adminClient = createClient(URL, SRK, { auth: { persistSession: false, autoRefreshToken: false } });
    const invitedBy = await currentAdmin(userClient, adminClient);

    const body = await req.json().catch(() => ({}));
    const action = cleanText(body.action || "access_link");
    const email = cleanEmail(body.email);
    const fullName = cleanText(body.full_name || body.fullName);
    const phone = body.phone ? cleanText(body.phone) : null;
    const role = cleanText(body.role || "spn");
    const roles = new Set(["owner", "admin", "manager", "spn", "lawyer", "broker", "viewer"]);

    if (!email || !email.includes("@")) return out({ error: "Укажите корректный email сотрудника." }, 400);
    if (!roles.has(role)) return out({ error: "Недопустимая роль Навигатора." }, 400);

    const existing = await findAuthUser(adminClient, email);

    if (action === "invite_email") {
      if (existing?.id) {
        await saveProfile(adminClient, existing.id, email, fullName || existing.user_metadata?.full_name || email, phone, role, invitedBy);
        const { error } = await adminClient.auth.resetPasswordForEmail(email, { redirectTo: REDIRECT });
        if (error) throw new Error("Письмо не отправлено: " + error.message);
        return out({ ok: true, mode: "recovery_email_sent", email, role, message: "Письмо для входа отправлено." });
      }
      const { data, error } = await adminClient.auth.admin.inviteUserByEmail(email, { redirectTo: REDIRECT, data: { full_name: fullName, nav_role: role } });
      if (error) throw new Error("Приглашение не отправлено: " + error.message);
      if (!data?.user?.id) throw new Error("Supabase не вернул id приглашенного пользователя.");
      await saveProfile(adminClient, data.user.id, email, fullName || email, phone, role, invitedBy);
      return out({ ok: true, mode: "invite_email_sent", email, role, message: "Приглашение отправлено." });
    }

    if (existing?.id) {
      await saveProfile(adminClient, existing.id, email, fullName || existing.user_metadata?.full_name || email, phone, role, invitedBy);
      const actionLink = await createRecoveryLink(adminClient, email);
      return out({ ok: true, mode: "existing_user_access_link", email, role, user_id: existing.id, action_link: actionLink, message: "Ссылка доступа создана для существующего пользователя." });
    }

    const { data: created, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password: makeTemporaryPassword(),
      email_confirm: true,
      user_metadata: { full_name: fullName, nav_role: role },
    });
    if (createError) throw new Error("Пользователь не создан: " + createError.message);
    if (!created?.user?.id) throw new Error("Supabase не вернул id нового пользователя.");

    await saveProfile(adminClient, created.user.id, email, fullName || email, phone, role, invitedBy);
    const actionLink = await createRecoveryLink(adminClient, email);
    return out({ ok: true, mode: "new_user_recovery_link", email, role, user_id: created.user.id, action_link: actionLink, message: "Пользователь создан. Ссылка установки пароля готова." });
  } catch (e) {
    console.error("nav-invite-user", e);
    return out({ error: msg(e) }, 500);
  }
});
