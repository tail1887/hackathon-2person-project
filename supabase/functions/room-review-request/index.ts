import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const headers = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers });
  if (request.method !== "POST") return json({ ok: false, error: { message: "허용하지 않는 요청이에요." } }, 405);
  const authorization = request.headers.get("Authorization"); const url = Deno.env.get("SUPABASE_URL"); const anon = Deno.env.get("SUPABASE_ANON_KEY");
  const { roomId } = await request.json().catch(() => ({}));
  if (!authorization || !url || !anon || typeof roomId !== "string") return json({ ok: false, error: { message: "문철을 신청할 수 없어요." } }, 400);
  const client = createClient(url, anon, { global: { headers: { Authorization: authorization } } });
  const { data, error } = await client.rpc("create_room_review_request", { p_room_id: roomId }); const result = data?.[0];
  if (error || !result || result.error_code) return json({ ok: false, error: { message: result?.error_code === "review_already_open" ? "진행 중인 AI 문철이 있어요." : "AI 문철을 신청할 수 없어요." } }, 400);
  return json({ ok: true, data: { requestId: result.request_id } });
});
