import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const headers = { "Content-Type": "application/json" };

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, error: { code: "method_not_allowed", message: "허용하지 않는 요청이에요." } }), { status: 405, headers });
  }

  const authorization = request.headers.get("Authorization");
  if (!authorization) {
    return new Response(JSON.stringify({ ok: false, error: { code: "unauthenticated", message: "로그인이 필요해요." } }), { status: 401, headers });
  }

  const url = Deno.env.get("SUPABASE_URL")!;
  const publishableKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const authClient = createClient(url, publishableKey, { global: { headers: { Authorization: authorization } } });
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) {
    return new Response(JSON.stringify({ ok: false, error: { code: "unauthenticated", message: "로그인이 필요해요." } }), { status: 401, headers });
  }

  const { displayName } = await request.json().catch(() => ({}));
  const normalizedName = typeof displayName === "string" ? displayName.trim() : "";
  if (!normalizedName || normalizedName.length > 30) {
    return new Response(JSON.stringify({ ok: false, error: { code: "invalid_display_name", message: "표시 이름은 1~30자로 입력해 주세요." } }), { status: 400, headers });
  }

  const admin = createClient(url, serviceRoleKey);
  const { data, error } = await admin
    .from("profiles")
    .update({ display_name: normalizedName, updated_at: new Date().toISOString() })
    .eq("id", user.id)
    .select("display_name")
    .single();
  if (error) {
    return new Response(JSON.stringify({ ok: false, error: { code: "profile_update_failed", message: "프로필을 저장하지 못했어요." } }), { status: 500, headers });
  }

  return new Response(JSON.stringify({ ok: true, data: { displayName: data.display_name } }), { headers });
});
