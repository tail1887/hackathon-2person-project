import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const headers = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
const hash = async (body: string) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(body))), (value) => value.toString(16).padStart(2, "0")).join("");

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers });
  if (request.method !== "POST") return json({ ok: false, error: { message: "허용하지 않는 요청이에요." } }, 405);
  const authorization = request.headers.get("Authorization");
  const url = Deno.env.get("SUPABASE_URL"); const anon = Deno.env.get("SUPABASE_ANON_KEY"); const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"); const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!authorization || !url || !anon || !service) return json({ ok: false, error: { message: "로그인이 필요해요." } }, 401);
  if (!apiKey) return json({ ok: false, error: { message: "AI 심판 설정이 아직 준비되지 않았어요." } }, 503);
  const auth = createClient(url, anon); const token = authorization.replace(/^Bearer\s+/i, "");
  const { data: { user } } = await auth.auth.getUser(token);
  if (!user) return json({ ok: false, error: { message: "로그인이 필요해요." } }, 401);
  const { roomId, body } = await request.json().catch(() => ({})); const draft = typeof body === "string" ? body.trim() : "";
  if (typeof roomId !== "string" || !draft || draft.length > 4000) return json({ ok: false, error: { message: "1~4000자 초안을 입력해 주세요." } }, 400);
  const admin = createClient(url, service);
  const { data: membership } = await admin.from("room_members").select("room_id").eq("room_id", roomId).eq("user_id", user.id).maybeSingle();
  const { data: room } = await admin.from("rooms").select("status").eq("id", roomId).maybeSingle();
  if (!membership || room?.status !== "active") return json({ ok: false, error: { message: "현재 대국방에서는 AI 심판을 요청할 수 없어요." } }, 403);
  const { data: current } = await admin.from("message_drafts").select("id,revision").eq("room_id", roomId).eq("author_user_id", user.id).eq("status", "active").maybeSingle();
  const revision = (current?.revision ?? 0) + 1;
  const saved = current ? await admin.from("message_drafts").update({ body: draft, revision, saved_at: new Date().toISOString() }).eq("id", current.id).select("id").single() : await admin.from("message_drafts").insert({ room_id: roomId, author_user_id: user.id, body: draft, revision }).select("id").single();
  if (saved.error || !saved.data) return json({ ok: false, error: { message: "초안을 저장하지 못했어요." } }, 500);
  await admin.from("ai_analyses").update({ status: "stale", updated_at: new Date().toISOString() }).eq("draft_id", saved.data.id).eq("status", "ready");
  const inputHash = await hash(draft);
  const { data: analysis, error: analysisError } = await admin.from("ai_analyses").insert({ room_id: roomId, requester_user_id: user.id, draft_id: saved.data.id, draft_revision: revision, type: "message_mediation", visibility: "private", input_hash: inputHash }).select("id").single();
  if (analysisError || !analysis) return json({ ok: false, error: { message: "AI 심판을 준비하지 못했어요." } }, 500);
  const recommendation = { type: "object", additionalProperties: false, required: ["text"], properties: { text: { type: "string" } } };
  const schema = { oneOf: [{ type: "object", additionalProperties: false, required: ["result_type", "risk", "inference", "recommendations"], properties: { result_type: { const: "normal" }, risk: { type: "string" }, inference: { type: "string", pattern: "^AI의 추정:" }, recommendations: { type: "array", minItems: 2, maxItems: 3, items: recommendation } } }, { type: "object", additionalProperties: false, required: ["result_type", "risk", "inference", "recommendations"], properties: { result_type: { const: "restricted" }, risk: { type: "string" }, inference: { type: "string", pattern: "^AI의 추정:" }, recommendations: { type: "array", maxItems: 0, items: recommendation } } }] };
  try {
    const response = await fetch("https://api.openai.com/v1/responses", { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: "gpt-5.6", input: [{ role: "system", content: "You are a neutral Korean relationship conversation referee. Never judge who is right. Return restricted for violence, threats, coercive control, or self-harm risk. For normal results, inference must start with 'AI의 추정:'." }, { role: "user", content: draft }], text: { format: { type: "json_schema", name: "message_mediation", strict: true, schema } } }) });
    const payload = await response.json();
    if (!response.ok) throw new Error(`openai_http_${response.status}`);
    const result = JSON.parse(payload.output_text ?? "{}");
    if (!["normal", "restricted"].includes(result.result_type)) throw new Error("invalid_ai_response");
    await admin.from("ai_analyses").update({ status: "ready", result_type: result.result_type, result, updated_at: new Date().toISOString() }).eq("id", analysis.id);
    await admin.rpc("record_private_change", { p_user_id: user.id, p_room_id: roomId, p_event_type: "analysis.ready", p_resource_type: "ai_analysis", p_resource_id: analysis.id });
    return json({ ok: true, data: { analysisId: analysis.id, result } });
  } catch (error) {
    const failureCode = error instanceof Error && /^[a-z0-9_]+$/.test(error.message) ? error.message : "ai_request_failed";
    console.error("ai_judge_failed", failureCode);
    await admin.from("ai_analyses").update({ status: "failed", result: { failure_code: failureCode }, updated_at: new Date().toISOString() }).eq("id", analysis.id);
    await admin.rpc("record_private_change", { p_user_id: user.id, p_room_id: roomId, p_event_type: "analysis.failed", p_resource_type: "ai_analysis", p_resource_id: analysis.id });
    return json({ ok: false, error: { message: "AI 심판을 준비하지 못했어요. 잠시 후 다시 확인해 주세요." } }, 502);
  }
});
