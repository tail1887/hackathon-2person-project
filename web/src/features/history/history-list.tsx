"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getBrowserSupabase } from "@/lib/supabase/browser";

type Props = { type: "missions" | "rooms" };
type Mission = { id: string; room_id: string; kind: "individual" | "joint"; text: string; status: string };
type Room = { id: string; status: "active" | "closed"; activated_at: string | null; closed_at: string | null };

export function HistoryList({ type }: Props) {
  const supabase = getBrowserSupabase();
  const [missions, setMissions] = useState<Mission[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!supabase) return;
    const query = type === "missions"
      ? supabase.from("mission_public").select("id,room_id,kind,text,status").order("updated_at", { ascending: false })
      : supabase.from("room_public").select("id,status,activated_at,closed_at").order("closed_at", { ascending: false });
    void query.then(({ data }) => {
      if (type === "missions") setMissions((data ?? []) as Mission[]);
      else setRooms((data ?? []) as Room[]);
      setLoading(false);
    });
  }, [supabase, type]);
  const title = type === "missions" ? "📌 미션 기록" : "⚔️ 대국 기록";
  return <main className="app-shell"><section className="app-frame mockup-app-frame"><header className="app-header"><Link className="btn-icon" href="/">←</Link><span className="app-title">⚖️ AI 심판</span><Link className="btn-icon" href="/">🏠</Link></header><div className="app-content"><h1 className="section-title">{title}</h1>{loading ? <article className="card empty-card">불러오는 중…</article> : type === "missions" ? <div className="history-list">{missions.length ? missions.map((mission) => <Link className="card history-card" href={`/missions/${mission.room_id}`} key={mission.id}><strong>{mission.text}</strong><span>{mission.kind === "joint" ? "공동 퀘스트" : "개인 미션"} · {mission.status}</span></Link>) : <article className="card empty-card">기록된 미션이 없습니다.</article>}</div> : <div className="history-list">{rooms.length ? rooms.map((room) => <Link className="card history-card" href={`/rooms/${room.id}`} key={room.id}><strong>{room.status === "active" ? "진행 중인 대국" : "종료된 대국"}</strong><span>{room.status === "active" ? "대국 이어가기" : "대국 기록 보기"}</span></Link>) : <article className="card empty-card">기록된 대국이 없습니다.</article>}</div>}</div></section></main>;
}
