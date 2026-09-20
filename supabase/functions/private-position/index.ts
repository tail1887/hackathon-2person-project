import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const headers = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
const hash = async (value: string) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))), (item) => item.toString(16).padStart(2, "0")).join("");

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers });
  if (request.method !== "POST") return json({ ok: false, error: { message: "허용하지 않는 요청이에요." } }, 405);
  const authorization = request.headers.get("Authorization");
  const url = Deno.env.get("SUPABASE_URL"); const anon = Deno.env.get("SUPABASE_ANON_KEY"); const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"); const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!authorization || !url || !anon || !service) return json({ ok: false, error: { message: "로그인이 필요해요." } }, 401);
  if (!apiKey) return json({ ok: false, error: { message: "AI 설정이 아직 준비되지 않았어요." } }, 503);
  const token = authorization.replace(/^Bearer\s+/i, ""); const auth = createClient(url, anon);
  const { data: { user } } = await auth.auth.getUser(token);
  const { roomId } = await request.json().catch(() => ({}));
  if (!user || typeof roomId !== "string") return json({ ok: false, error: { message: "대국방을 확인할 수 없어요." } }, 400);
  const admin = createClient(url, service);
  const [{ data: room }, { data: membership }] = await Promise.all([
    admin.from("rooms").select("status").eq("id", roomId).maybeSingle(),
    admin.from("room_members").select("room_id").eq("room_id", roomId).eq("user_id", user.id).maybeSingle(),
  ]);
  if (!membership || room?.status !== "active") return json({ ok: false, error: { message: "현재 대국방에서는 형세를 파악할 수 없어요." } }, 403);
  const { data: messages } = await admin.from("messages").select("sequence,body").eq("room_id", roomId).order("sequence", { ascending: false }).limit(20);
  const context = (messages ?? []).reverse(); const contextText = context.map((message) => `${message.sequence}. ${message.body}`).join("\n");
  const contextThroughSequence = context.at(-1)?.sequence ?? 0;
  const { data: analysis, error: insertError } = await admin.from("ai_analyses").insert({ room_id: roomId, requester_user_id: user.id, type: "private_position", visibility: "private", input_hash: await hash(contextText), context_through_sequence: contextThroughSequence }).select("id").single();
  if (insertError || !analysis) return json({ ok: false, error: { message: "형세 파악을 준비하지 못했어요." } }, 500);
  const schema = { type: "object", additionalProperties: false, required: ["current_position", "issues", "next_move"], properties: {
    current_position: { type: "string", pattern: "^AI의 추정:" },
    issues: { type: "array", minItems: 1, maxItems: 3, items: { type: "string", pattern: "^AI의 추정:" } },
    next_move: { type: "string", pattern: "^AI의 추정:" },
  } };
  try {
    const response = await fetch("https://api.openai.com/v1/responses", { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: "gpt-5.6", input: [{ role: "system", content: "You are a neutral Korean relationship conversation guide. Analyze only the supplied chat. Never decide who is right, diagnose a relationship, or claim certainty. Every field must begin with AI의 추정:." }, { role: "user", content: contextText || "아직 확정된 대화가 없습니다." }], text: { format: { type: "json_schema", name: "private_position", strict: true, schema } } }) });
    const payload = await response.json();
    if (!response.ok) throw new Error(`openai_http_${response.status}`);
    const outputText = typeof payload.output_text === "string" ? payload.output_text : payload.output?.flatMap((item: { content?: { type?: string; text?: string }[] }) => item.content ?? []).find((item: { type?: string; text?: string }) => item.type === "output_text" && typeof item.text === "string")?.text;
    const result = JSON.parse(outputText ?? "{}");
    if (!result.current_position) throw new Error("invalid_ai_response");
    await admin.from("ai_analyses").update({ status: "ready", result_type: "normal", result, updated_at: new Date().toISOString() }).eq("id", analysis.id);
    await admin.rpc("record_private_change", { p_user_id: user.id, p_room_id: roomId, p_event_type: "analysis.ready", p_resource_type: "ai_analysis", p_resource_id: analysis.id });
    return json({ ok: true, data: { analysisId: analysis.id, result } });
  } catch (error) {
    const failureCode = error instanceof Error && /^[a-z0-9_]+$/.test(error.message) ? error.message : "ai_request_failed";
    console.error("private_position_failed", failureCode);
    await admin.from("ai_analyses").update({ status: "failed", result: { failure_code: failureCode }, updated_at: new Date().toISOString() }).eq("id", analysis.id);
    await admin.rpc("record_private_change", { p_user_id: user.id, p_room_id: roomId, p_event_type: "analysis.failed", p_resource_type: "ai_analysis", p_resource_id: analysis.id });
    return json({ ok: false, error: { message: "형세 파악을 준비하지 못했어요. 잠시 후 다시 시도해 주세요." } }, 502);
  }
});
