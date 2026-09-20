import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const headers = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
const hash = async (value: string) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))), (item) => item.toString(16).padStart(2, "0")).join("");

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers });
  if (request.method !== "POST") return json({ ok: false, error: { message: "허용하지 않는 요청이에요." } }, 405);
  const authorization = request.headers.get("Authorization");
  const url = Deno.env.get("SUPABASE_URL"); const anon = Deno.env.get("SUPABASE_ANON_KEY"); const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"); const apiKey = Deno.env.get("OPENAI_API_KEY");
  const { requestId } = await request.json().catch(() => ({}));
  if (!authorization || !url || !anon || !service || typeof requestId !== "string") return json({ ok: false, error: { message: "AI 문철을 수락할 수 없어요." } }, 400);
  if (!apiKey) return json({ ok: false, error: { message: "AI 설정이 아직 준비되지 않았어요." } }, 503);
  const client = createClient(url, anon, { global: { headers: { Authorization: authorization } } });
  const { data: accepted, error: acceptError } = await client.rpc("accept_room_review_request", { p_request_id: requestId }); const acceptance = accepted?.[0];
  if (acceptError || !acceptance || acceptance.error_code) return json({ ok: false, error: { message: "이 AI 문철은 지금 수락할 수 없어요." } }, 400);
  const admin = createClient(url, service);
  const { data: reviewRequest } = await admin.from("room_review_requests").select("room_id,requester_user_id,context_through_sequence").eq("id", requestId).single();
  if (!reviewRequest) return json({ ok: false, error: { message: "AI 문철을 준비하지 못했어요." } }, 500);
  const { data: messages } = await admin.from("messages").select("sequence,body").eq("room_id", reviewRequest.room_id).lte("sequence", reviewRequest.context_through_sequence).order("sequence");
  const contextText = (messages ?? []).map((message) => `${message.sequence}. ${message.body}`).join("\n");
  const { data: analysis, error: analysisError } = await admin.from("ai_analyses").insert({ room_id: reviewRequest.room_id, requester_user_id: reviewRequest.requester_user_id, type: "room_review", visibility: "room", input_hash: await hash(contextText), context_through_sequence: reviewRequest.context_through_sequence }).select("id").single();
  if (analysisError || !analysis) { await admin.from("room_review_requests").update({ status: "failed" }).eq("id", requestId); return json({ ok: false, error: { message: "AI 문철을 준비하지 못했어요." } }, 500); }
  await admin.from("room_review_requests").update({ analysis_id: analysis.id }).eq("id", requestId);
  const schema = { type: "object", additionalProperties: false, required: ["summary", "different_points", "wishes_and_worries", "next_move"], properties: {
    summary: { type: "string" },
    different_points: { type: "array", minItems: 1, maxItems: 3, items: { type: "string" } },
    wishes_and_worries: { type: "array", minItems: 1, maxItems: 3, items: { type: "string", pattern: "^AI의 추정:" } },
    next_move: { type: "string", pattern: "^AI의 추정:" },
  } };
  try {
    const response = await fetch("https://api.openai.com/v1/responses", { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: "gpt-5.6", input: [{ role: "system", content: "You are a neutral Korean relationship conversation mediator. Analyze only the supplied chat. Do not declare winners, blame either participant, diagnose their relationship, or state certainty about inner feelings. Wishes, worries, and next move must begin with AI의 추정:." }, { role: "user", content: contextText || "아직 확정된 대화가 없습니다." }], text: { format: { type: "json_schema", name: "room_review", strict: true, schema } } }) });
    const payload = await response.json(); const result = JSON.parse(payload.output_text ?? "{}");
    if (!response.ok || !result.summary) throw new Error("invalid_ai_response");
    await admin.from("ai_analyses").update({ status: "ready", result_type: "normal", result, updated_at: new Date().toISOString() }).eq("id", analysis.id);
    await admin.from("room_review_requests").update({ status: "ready" }).eq("id", requestId);
    return json({ ok: true, data: { analysisId: analysis.id } });
  } catch {
    await admin.from("ai_analyses").update({ status: "failed", updated_at: new Date().toISOString() }).eq("id", analysis.id);
    await admin.from("room_review_requests").update({ status: "failed" }).eq("id", requestId);
    return json({ ok: false, error: { message: "AI 문철을 준비하지 못했어요. 잠시 후 다시 시도해 주세요." } }, 502);
  }
});
