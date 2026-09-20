import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const randomToken = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) => byte.toString(16).padStart(2, "0")).join("");
const digest = async (value: string) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))), (byte) => byte.toString(16).padStart(2, "0")).join("");

Deno.serve(async (request) => {
  const authorization = request.headers.get("Authorization");
  if (!authorization) return json({ ok: false, error: { code: "unauthenticated", message: "로그인이 필요해요." } }, 401);
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authorization } } });
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const token = randomToken(); const code = String(Math.floor(100000 + Math.random() * 900000));
    const { data, error } = await supabase.rpc("create_room_with_invite", { p_code: code, p_token_digest: await digest(token) });
    const result = data?.[0];
    if (error || !result) return json({ ok: false, error: { code: "room_create_failed", message: "대국방을 준비하지 못했어요." } }, 500);
    if (result.error_code === "invite_generation_failed") continue;
    if (result.error_code) return json({ ok: false, error: { code: result.error_code, message: result.error_code === "active_room_exists" ? "이미 진행 중인 대국이 있어요." : "대국방을 준비하지 못했어요." } }, 400);
    return json({ ok: true, data: { roomId: result.room_id, code, token } });
  }
  return json({ ok: false, error: { code: "room_create_failed", message: "대국방을 준비하지 못했어요." } }, 500);
});
