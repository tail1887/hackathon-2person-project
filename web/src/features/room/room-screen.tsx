"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Avatar } from "@/features/profile/avatar";
import { getBrowserSupabase } from "@/lib/supabase/browser";

type Room = { id: string; status: "active" | "closed"; room_revision: number };
type Member = { room_id: string; role: "creator" | "invitee"; public_member_key: string; room_display_name: string };
type Message = { id: string; room_id: string; sender_member_key: string; body: string; sequence: number; sent_at: string };
type ConnectionState = "loading" | "connected" | "recovering" | "failed";

export function RoomScreen({ roomId }: { roomId: string }) {
  const supabase = getBrowserSupabase();
  const [room, setRoom] = useState<Room>();
  const [members, setMembers] = useState<Member[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [connection, setConnection] = useState<ConnectionState>("loading");
  const latestRevision = useRef(0);
  const recovering = useRef(false);

  const loadSnapshot = useCallback(async () => {
    if (!supabase) return false;
    const [roomResult, membersResult, messagesResult] = await Promise.all([
      supabase.from("room_public").select("id,status,room_revision").eq("id", roomId).maybeSingle(),
      supabase.from("room_member_public").select("room_id,role,public_member_key,room_display_name").eq("room_id", roomId),
      supabase.from("room_message_public").select("id,room_id,sender_member_key,body,sequence,sent_at").eq("room_id", roomId).order("sequence"),
    ]);
    if (roomResult.error || !roomResult.data || membersResult.error || messagesResult.error) return false;
    const nextRoom = roomResult.data as Room;
    if (nextRoom.room_revision < latestRevision.current) return true;
    latestRevision.current = nextRoom.room_revision;
    setRoom(nextRoom); setMembers((membersResult.data ?? []) as Member[]); setMessages((messagesResult.data ?? []) as Message[]);
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

  return <main className="app-shell"><section className="app-frame">
    <header className="app-header"><Link className="app-title" href="/"><span className="app-title-mark">⚖</span>AI 심판</Link><span className={`tag ${room.status === "active" ? "tag-active" : "tag-closed"}`}>{room.status === "active" ? "대국 진행 중" : "대국 종료"}</span></header>
    <div className="app-content room-page">
      {connection === "recovering" && <p className="connection-notice">연결을 복구하는 중이에요. 마지막 대국 기록을 읽기 전용으로 보여드려요.</p>}
      {connection === "failed" && <p className="notice">연결을 복구하지 못했어요. <button className="inline-button" onClick={recover} type="button">다시 시도</button></p>}
      <div className="page-intro"><p className="eyebrow">두 사람의 대국</p><h1>{members.length === 2 ? "두 사람이 연결됐어요" : "상대를 기다리고 있어요"}</h1><p className="muted">대화 전송은 AI 심판과 함께 다음 단계에서 시작됩니다.</p></div>
      <section className="member-list" aria-label="대국 멤버">{members.map((member) => <article className="member-card" key={member.public_member_key}><Avatar displayName={member.room_display_name} /><div><strong>{member.room_display_name}</strong><p>{member.role === "creator" ? "대국을 시작한 사람" : "초대로 입장한 사람"}</p></div></article>)}</section>
      <section className="message-panel"><h2>대국 기록</h2>{messages.length === 0 ? <div className="empty-card"><p>아직 확정된 대화가 없어요.</p><p className="hint">첫 메시지는 AI 심판을 거친 뒤 두 사람에게 같은 순서로 표시됩니다.</p></div> : <ol className="message-list">{messages.map((message) => <li key={message.id}><span>{members.find((member) => member.public_member_key === message.sender_member_key)?.room_display_name ?? "상대"}</span><p>{message.body}</p></li>)}</ol>}</section>
      <p className="room-revision">공용 상태 #{room.room_revision}</p>
    </div>
  </section></main>;
}
