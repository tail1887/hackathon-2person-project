"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { getBrowserSupabase } from "@/lib/supabase/browser";
import { getFunctionErrorMessage } from "@/lib/supabase/function-error";

type Room = { id: string; status: "active" | "closed"; room_revision: number };
type Member = { room_id: string; role: "creator" | "invitee"; public_member_key: string; room_display_name: string };
type Message = { id: string; room_id: string; sender_member_key: string; body: string; sequence: number; sent_at: string };
type ConnectionState = "loading" | "connected" | "recovering" | "failed";
type JudgeResult = { result_type: "normal" | "restricted"; risk: string; inference: string; recommendations: { text: string }[] };
type PositionResult = { current_position: string; issues: string[]; next_move: string };
type ReviewResult = { summary: string; different_points: string[]; wishes_and_worries: string[]; next_move: string };
type ReviewRequest = { id: string; status: "pending" | "processing" | "ready" | "failed"; is_requester: boolean; is_responder: boolean };
type RoomReview = { id: string; result: ReviewResult; status: "ready" };

export function RoomScreen({ roomId }: { roomId: string }) {
  const supabase = getBrowserSupabase();
  const [room, setRoom] = useState<Room>();
  const [members, setMembers] = useState<Member[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [connection, setConnection] = useState<ConnectionState>("loading");
  const [draft, setDraft] = useState("");
  const [judge, setJudge] = useState<{ id: string; result: JudgeResult }>();
  const [judgeError, setJudgeError] = useState<string>();
  const [isJudging, setIsJudging] = useState(false);
  const [position, setPosition] = useState<PositionResult>();
  const [reviewRequest, setReviewRequest] = useState<ReviewRequest>();
  const [roomReview, setRoomReview] = useState<RoomReview>();
  const [isRoomReviewOpen, setIsRoomReviewOpen] = useState(false);
  const [toolError, setToolError] = useState<string>();
  const [isToolWorking, setIsToolWorking] = useState(false);
  const latestRevision = useRef(0);
  const recovering = useRef(false);

  const loadSnapshot = useCallback(async () => {
    if (!supabase) return false;
    const [roomResult, membersResult, messagesResult, reviewRequestResult, roomReviewResult] = await Promise.all([
      supabase.from("room_public").select("id,status,room_revision").eq("id", roomId).maybeSingle(),
      supabase.from("room_member_public").select("room_id,role,public_member_key,room_display_name").eq("room_id", roomId),
      supabase.from("room_message_public").select("id,room_id,sender_member_key,body,sequence,sent_at").eq("room_id", roomId).order("sequence"),
      supabase.from("room_review_request_public").select("id,status,is_requester,is_responder").eq("room_id", roomId).order("requested_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("room_review_public").select("id,result,status").eq("room_id", roomId).eq("status", "ready").order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    if (roomResult.error || !roomResult.data || membersResult.error || messagesResult.error) return false;
    const nextRoom = roomResult.data as Room;
    if (nextRoom.room_revision < latestRevision.current) return true;
    latestRevision.current = nextRoom.room_revision;
    setRoom(nextRoom); setMembers((membersResult.data ?? []) as Member[]); setMessages((messagesResult.data ?? []) as Message[]);
    setReviewRequest((reviewRequestResult.data ?? undefined) as ReviewRequest | undefined);
    setRoomReview((roomReviewResult.data ?? undefined) as RoomReview | undefined);
    return true;
  }, [roomId, supabase]);

  const recover = useCallback(() => {
    if (recovering.current) return;
    recovering.current = true; setConnection("recovering");
    const startedAt = Date.now();
    const retry = async () => {
      if (await loadSnapshot()) { recovering.current = false; setConnection("connected"); return; }
      if (Date.now() - startedAt >= 30_000) { recovering.current = false; setConnection("failed"); return; }
      window.setTimeout(() => void retry(), 2_000);
    };
    void retry();
  }, [loadSnapshot]);

  async function requestJudge() {
    if (!supabase || !draft.trim()) return;
    setIsJudging(true); setJudge(undefined); setJudgeError(undefined);
    const { data, error } = await supabase.functions.invoke("ai-judge", { body: { roomId, body: draft } });
    setIsJudging(false);
    if (error || !data?.ok) { setJudgeError(error ? await getFunctionErrorMessage(error, "AI 심판을 준비하지 못했어요.") : data?.error?.message ?? "AI 심판을 준비하지 못했어요."); return; }
    setJudge({ id: data.data.analysisId, result: data.data.result as JudgeResult });
  }

  async function sendChoice(choice: "original" | "recommendation") {
    if (!supabase || !judge) return;
    setIsJudging(true); setJudgeError(undefined);
    const { data, error } = await supabase.functions.invoke("message-send", { body: { analysisId: judge.id, choice } });
    setIsJudging(false);
    if (error || !data?.ok) { setJudgeError(error ? await getFunctionErrorMessage(error, "메시지를 전송하지 못했어요.") : data?.error?.message ?? "메시지를 전송하지 못했어요."); return; }
    setDraft(""); setJudge(undefined); await loadSnapshot();
  }

  async function requestPosition() {
    if (!supabase) return;
    setIsToolWorking(true); setToolError(undefined); setPosition(undefined);
    const { data, error } = await supabase.functions.invoke("private-position", { body: { roomId } });
    setIsToolWorking(false);
    if (error || !data?.ok) { setToolError(error ? await getFunctionErrorMessage(error, "형세 파악을 준비하지 못했어요.") : data?.error?.message ?? "형세 파악을 준비하지 못했어요."); return; }
    setPosition(data.data.result as PositionResult);
  }

  async function requestRoomReview() {
    if (!supabase) return;
    setIsToolWorking(true); setToolError(undefined);
    const { data, error } = await supabase.functions.invoke("room-review-request", { body: { roomId } });
    setIsToolWorking(false);
    if (error || !data?.ok) { setToolError(error ? await getFunctionErrorMessage(error, "AI 문철을 신청하지 못했어요.") : data?.error?.message ?? "AI 문철을 신청하지 못했어요."); return; }
    await loadSnapshot();
  }

  async function acceptRoomReview() {
    if (!supabase || !reviewRequest) return;
    setIsToolWorking(true); setToolError(undefined);
    const { data, error } = await supabase.functions.invoke("room-review-accept", { body: { requestId: reviewRequest.id } });
    setIsToolWorking(false);
    if (error || !data?.ok) { setToolError(error ? await getFunctionErrorMessage(error, "AI 문철을 수락하지 못했어요.") : data?.error?.message ?? "AI 문철을 수락하지 못했어요."); return; }
    await loadSnapshot();
  }

  useEffect(() => {
    if (!supabase) return;
    let disposed = false;
    void loadSnapshot().then((loaded) => {
      if (disposed) return;
      setConnection(loaded ? "connected" : "failed");
    });
    const channel = supabase.channel(`room:${roomId}`, { config: { private: true } })
      .on("broadcast", { event: "room.member_joined" }, () => void loadSnapshot())
      .on("broadcast", { event: "message.sent" }, () => void loadSnapshot())
      .on("broadcast", { event: "room.review_changed" }, () => void loadSnapshot())
      .subscribe((status) => {
        if (disposed) return;
        if (status === "SUBSCRIBED") { void loadSnapshot().then((loaded) => loaded ? setConnection("connected") : recover()); }
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") recover();
      });
    return () => { disposed = true; void supabase.removeChannel(channel); };
  }, [loadSnapshot, recover, roomId, supabase]);

  if (!supabase) return <main className="auth-shell"><p className="notice">Supabase 연결값이 필요해요.</p></main>;
  if (!room && connection === "loading") return <main className="auth-shell"><p className="notice">대국방을 불러오는 중이에요.</p></main>;
  if (!room) return <main className="auth-shell"><section className="auth-card"><p className="eyebrow">대국방</p><h1>대국방을 열 수 없어요</h1><p className="muted">권한을 확인한 뒤 다시 시도해 주세요.</p><Link className="secondary-button room-link-button" href="/">메인으로 돌아가기</Link></section></main>;

  const participantNames = members.map((member) => member.room_display_name).join(" · ");

  return <main className="app-shell"><section className="app-frame">
    <header className="app-header"><Link className="app-title" href="/"><span className="app-title-mark">⚖</span>AI 심판</Link><span className={`tag ${room.status === "active" ? "tag-active" : "tag-closed"}`}>{room.status === "active" ? "대국 진행 중" : "대국 종료"}</span></header>
    <div className="app-content room-page">
      {connection === "recovering" && <p className="connection-notice">연결을 복구하는 중이에요. 마지막 대국 기록을 읽기 전용으로 보여드려요.</p>}
      {connection === "failed" && <p className="notice">연결을 복구하지 못했어요. <button className="inline-button" onClick={recover} type="button">다시 시도</button></p>}
      <section className="room-summary" aria-label="대국방 요약"><div><p className="room-summary-name">{participantNames || "대국방"}</p><p className="room-summary-sub">{members.length === 2 ? "두 사람이 연결됨" : "상대 입장 대기 중"}</p></div><span className="room-id-label">대국방 #{room.id.slice(0, 8)}</span></section>
      {members.length < 2 && <p className="connection-notice">상대가 입장하면 대국방이 자동으로 연결됩니다.</p>}
      <section className="chat-section" aria-label="대국 기록">
        <h1 className="sr-only">대국방</h1>
        <div className="chat-container">
          {messages.length === 0 ? <div className="chat-empty"><p>아직 확정된 대화가 없어요.</p><p className="hint">첫 메시지는 AI 심판을 거친 뒤 두 사람에게 같은 순서로 표시됩니다.</p></div> : <ol className="message-list">{messages.map((message) => <li key={message.id}><span>{members.find((member) => member.public_member_key === message.sender_member_key)?.room_display_name ?? "참여자"}</span><p>{message.body}</p></li>)}</ol>}
        </div>
      </section>
      <section className="chat-bottom" aria-label="대국 도구와 메시지 초안">
        <div className="chat-tools">
          <button className="tool-button" disabled={isToolWorking || room.status !== "active"} onClick={requestPosition} type="button">📊 형세 파악</button>
          <button className="tool-button" disabled={isToolWorking || room.status !== "active" || members.length < 2 || Boolean(reviewRequest && reviewRequest.status !== "ready")} onClick={requestRoomReview} type="button">⚖️ AI 문철</button>
          <button className="tool-button tool-button-outline" disabled type="button">🤝 무승부 제안</button>
        </div>
        <div className="chat-input-row"><textarea aria-label="메시지 초안" onChange={(event) => { setDraft(event.target.value); setJudge(undefined); }} placeholder="초안 메시지를 입력하세요..." rows={2} value={draft} /><button className="primary-button" disabled={isJudging || !draft.trim() || room.status !== "active"} onClick={requestJudge} type="button">{isJudging ? "확인 중…" : "확인"}</button></div>
        <p className="chat-boundary-note">초안 작성 뒤 AI 심판을 거친 메시지만 전송됩니다.</p>
        {judgeError && <p className="notice">{judgeError}</p>}
        {toolError && <p className="notice">{toolError}</p>}
        {reviewRequest?.status === "pending" && <section className="tool-sheet"><strong>AI 문철 신청이 도착했어요</strong><p>{reviewRequest.is_responder ? "두 사람이 함께 확인할 공용 문철을 만들까요? 수락 뒤에만 AI가 대화를 정리해요." : "상대의 수락을 기다리고 있어요. 수락 전에는 AI 분석을 만들지 않아요."}</p>{reviewRequest.is_responder && <button className="primary-button" disabled={isToolWorking} onClick={acceptRoomReview} type="button">문철 수락</button>}</section>}
        {reviewRequest && ["processing"].includes(reviewRequest.status) && <section className="tool-sheet"><strong>AI 문철을 정리하고 있어요</strong><p>두 사람에게 같은 결과가 준비되면 아래 버튼으로 확인할 수 있어요.</p></section>}
        {roomReview && <button className="review-open-button" onClick={() => setIsRoomReviewOpen(true)} type="button">AI 문철 확인하기</button>}
        {judge && <section className="judge-sheet" aria-label="AI 심판 결과"><strong>⚖️ AI 심판 결과</strong><p>{judge.result.risk}</p><p>{judge.result.inference}</p>{judge.result.result_type === "restricted" ? <button className="secondary-button" onClick={() => setJudge(undefined)} type="button">초안 수정</button> : <><p className="hint">추천: {judge.result.recommendations[0]?.text}</p><div className="button-row"><button className="secondary-button" disabled={isJudging} onClick={() => void sendChoice("original")} type="button">원문 전송</button><button className="primary-button" disabled={isJudging || !judge.result.recommendations[0]} onClick={() => void sendChoice("recommendation")} type="button">추천 전송</button></div></>}</section>}
      </section>
      {position && <section className="analysis-dialog" role="dialog" aria-modal="true" aria-label="개인 형세 파악"><div className="analysis-card"><button className="dialog-close" onClick={() => setPosition(undefined)} type="button" aria-label="닫기">×</button><p className="eyebrow">나만 보는 형세 파악</p><h2>현재 대화의 흐름</h2><p>{position.current_position}</p><h3>쟁점</h3><ul>{position.issues.map((issue) => <li key={issue}>{issue}</li>)}</ul><h3>다음 판단</h3><p>{position.next_move}</p></div></section>}
      {isRoomReviewOpen && roomReview?.result && <section className="analysis-dialog" role="dialog" aria-modal="true" aria-label="AI 문철"><div className="analysis-card"><button className="dialog-close" onClick={() => setIsRoomReviewOpen(false)} type="button" aria-label="닫기">×</button><p className="eyebrow">두 사람의 AI 문철</p><h2>대화 요약</h2><p>{roomReview.result.summary}</p><h3>서로 다른 지점</h3><ul>{roomReview.result.different_points.map((point) => <li key={point}>{point}</li>)}</ul><h3>바람과 걱정</h3><ul>{roomReview.result.wishes_and_worries.map((item) => <li key={item}>{item}</li>)}</ul><h3>다음 수</h3><p>{roomReview.result.next_move}</p></div></section>}
    </div>
  </section></main>;
}
