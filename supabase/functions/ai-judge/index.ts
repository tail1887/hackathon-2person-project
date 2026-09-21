import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const headers = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
const hash = async (body: string) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(body))), (value) => value.toString(16).padStart(2, "0")).join("");
const riskDraftPattern = /(자살|자해|죽어\s*(버려|라)|죽일\s*(거|것|게|래|테)|해칠\s*(거|것|게|래|테)|때릴\s*(거|것|게|래|테)|폭력|협박|감금|통제)/;
// 경고에서 지적한 책임 전가·가정법 비난을 추천문이 그대로 반복하면 안 된다.
const blameRepeatingRecommendationPattern = /(?:너|네|니|상대방).{0,18}(?:탓|때문|잘\s*했|신경\s*썼|처리했|했더라면|했으면|안\s*그랬)|(?:이런|지금\s*같은).{0,12}문제.{0,14}(?:생기지|없었)|(?:꼼꼼|더).{0,16}(?:챙겼다면|신경\s*썼다면|처리했다면)/;
const restrictedResult = {
  result_type: "restricted",
  risk: "이 문장에는 AI 심판을 제공할 수 없습니다. 문장을 수정해 다시 확인해 주세요.",
  inference: "",
  speaker_intent: "",
  speech_act: "statement",
  recommendations: [],
};

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
  const [{ data: current }, { data: latestDraft }] = await Promise.all([
    admin.from("message_drafts").select("id,revision").eq("room_id", roomId).eq("author_user_id", user.id).eq("status", "active").limit(1).maybeSingle(),
    admin.from("message_drafts").select("revision").eq("room_id", roomId).eq("author_user_id", user.id).order("revision", { ascending: false }).limit(1).maybeSingle(),
  ]);
  // revision은 활성 초안 하나의 번호가 아니라 방 안에서 이 사용자가 만든 모든 초안에 대해 단조 증가해야 한다.
  // 전송된 초안만 남은 경우에도 이전 revision을 재사용하면 DB 고유 제약에 걸린다.
  const revision = Math.max(current?.revision ?? 0, latestDraft?.revision ?? 0) + 1;
  const saved = current ? await admin.from("message_drafts").update({ body: draft, revision, saved_at: new Date().toISOString() }).eq("id", current.id).select("id").single() : await admin.from("message_drafts").insert({ room_id: roomId, author_user_id: user.id, body: draft, revision }).select("id").single();
  if (saved.error || !saved.data) {
    console.error("draft_save_failed", saved.error?.code ?? "unknown");
    return json({ ok: false, error: { message: "초안을 저장하지 못했어요." } }, 500);
  }
  await admin.from("ai_analyses").update({ status: "stale", updated_at: new Date().toISOString() }).eq("draft_id", saved.data.id).eq("status", "ready");
  const inputHash = await hash(draft);
  const { data: analysis, error: analysisError } = await admin.from("ai_analyses").insert({ room_id: roomId, requester_user_id: user.id, draft_id: saved.data.id, draft_revision: revision, type: "message_mediation", visibility: "private", input_hash: inputHash }).select("id").single();
  if (analysisError || !analysis) return json({ ok: false, error: { message: "AI 심판을 준비하지 못했어요." } }, 500);
  // 위험 초안은 모델의 안전 거절 형식에 의존하지 않고 서버에서 즉시 전송 불가 결과로 확정한다.
  if (riskDraftPattern.test(draft)) {
    await admin.from("ai_analyses").update({ status: "ready", result_type: "restricted", result: restrictedResult, updated_at: new Date().toISOString() }).eq("id", analysis.id);
    await admin.rpc("record_private_change", { p_user_id: user.id, p_room_id: roomId, p_event_type: "analysis.ready", p_resource_type: "ai_analysis", p_resource_id: analysis.id });
    return json({ ok: true, data: { analysisId: analysis.id, result: restrictedResult } });
  }
  const recommendation = { type: "object", additionalProperties: false, required: ["text"], properties: { text: { type: "string", description: "The exact first-person Korean message the user can send to their counterpart now. It must preserve the draft's speaker, addressee, and speech act. It is never a reply to the draft itself, advice, analysis, or an instruction to the user. It must not repeat the risky blame, counterfactual, or responsibility-attribution wording identified in risk." } } };
  // Structured Outputs는 최상위 스키마를 객체로 요구한다. normal/restricted 분기는 반환값 검증에서 강제한다.
  const schema = { type: "object", additionalProperties: false, required: ["result_type", "risk", "inference", "speaker_intent", "speech_act", "recommendations"], properties: { result_type: { type: "string", enum: ["normal", "restricted"] }, risk: { type: "string" }, inference: { type: "string", pattern: "^AI의 추정:" }, speaker_intent: { type: "string", description: "A short summary of what the user, as the sender of the draft, is trying to communicate." }, speech_act: { type: "string", enum: ["question", "answer", "request", "statement", "boundary"] }, recommendations: { type: "array", maxItems: 3, items: recommendation } } };
  try {
    const response = await fetch("https://api.openai.com/v1/responses", { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: "gpt-5.6", input: [{ role: "system", content: "You are a neutral Korean relationship conversation referee. The user draft is ALWAYS a message the current user is about to send to their counterpart. It is not a message received by the user. First identify the user's speaker intent and speech act. Every recommendation must preserve the same speaker (the user), addressee (the counterpart), and core speech act: a question remains a question to the counterpart; an answer remains the user's answer; a boundary remains the user's boundary. Never answer the draft as if the counterpart said it, and never invent an unstated earlier exchange or the counterpart's feelings. For normal results, inference must start with 'AI의 추정:'. The risk field is a constraint for every recommendation: do not repeat, endorse, paraphrase, or soften the risky blame, counterfactual, or responsibility-attribution pattern described in risk. If the draft blames the other person or says a problem would not have happened if they had acted differently, express the sender's concrete impact or need and a forward-looking request instead. Example direction only: '이번 일로 답답하고 속상했어. 다음에는 어떻게 서로 챙길지 이야기하고 싶어.' Never say or imply '네가 더 잘했더라면', '문제는 없었을 거야', or '네 탓'. Each recommendation must be a ready-to-send, first-person Korean message addressed directly to the other person, in one or two natural sentences. Soften the tone without reversing the intent. Do not give advice, explain how to communicate, or use instructional wording such as '~해보세요', '~하세요', '~하는 게 좋아요', or '~바랍니다'." }, { role: "user", content: draft }], text: { format: { type: "json_schema", name: "message_mediation", strict: true, schema } } }) });
    const payload = await response.json();
    if (!response.ok) throw new Error(`openai_http_${response.status}`);
    const outputText = typeof payload.output_text === "string" ? payload.output_text : payload.output?.flatMap((item: { content?: { type?: string; text?: string }[] }) => item.content ?? []).find((item: { type?: string; text?: string }) => item.type === "output_text" && typeof item.text === "string")?.text;
    const result = JSON.parse(outputText ?? "{}");
    const recommendationCount = Array.isArray(result.recommendations) ? result.recommendations.length : -1;
    if (!["normal", "restricted"].includes(result.result_type)) throw new Error("invalid_result_type");
    if (typeof result.speaker_intent !== "string" || !["question", "answer", "request", "statement", "boundary"].includes(result.speech_act)) throw new Error("invalid_intent_contract");
    // MVP 전송에는 하나의 추천문이면 충분하다. restricted 결과에는 추천문을 제공하지 않는다.
    if (result.result_type === "normal" && recommendationCount < 1) throw new Error("missing_recommendation");
    if (result.result_type === "restricted" && recommendationCount !== 0) throw new Error("restricted_with_recommendation");
    if (result.result_type === "normal" && result.recommendations.some((recommendation: { text?: unknown }) => typeof recommendation.text !== "string" || /(해보세요|확인해 보세요|진정한 뒤|말해보세요|하는 게 좋아요|바랍니다)/.test(recommendation.text))) throw new Error("instructional_recommendation");
    if (result.result_type === "normal" && result.recommendations.some((recommendation: { text: string }) => blameRepeatingRecommendationPattern.test(recommendation.text))) throw new Error("blame_repeating_recommendation");
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
