import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
const randomToken = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) => byte.toString(16).padStart(2, "0")).join("");
const digest = async (value: string) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))), (byte) => byte.toString(16).padStart(2, "0")).join("");

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers });
  if (request.method !== "POST") return json({ ok: false, error: { code: "method_not_allowed", message: "허용하지 않는 요청이에요." } }, 405);
  const authorization = request.headers.get("Authorization");
  if (!authorization) return json({ ok: false, error: { code: "unauthenticated", message: "로그인이 필요해요." } }, 401);
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const accessToken = authorization.replace(/^Bearer\s+/i, "");
  const auth = createClient(supabaseUrl, supabaseAnonKey);
  const { data: { user }, error: authError } = await auth.auth.getUser(accessToken);
  if (authError || !user) return json({ ok: false, error: { code: "unauthenticated", message: "로그인이 필요해요." } }, 401);
  const supabase = createClient(supabaseUrl, supabaseAnonKey, { global: { headers: { Authorization: authorization } } });
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
