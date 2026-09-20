"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getBrowserSupabase } from "@/lib/supabase/browser";
import { Avatar } from "@/features/profile/avatar";

type Profile = { display_name: string };

export function Dashboard() {
  const supabase = getBrowserSupabase();
  const [profile, setProfile] = useState<Profile>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!supabase) return;
    void supabase.auth.getUser().then(async ({ data: { user }, error: userError }) => {
      if (userError || !user) {
        setError("로그인 정보를 불러오지 못했어요.");
        return;
      }
      const { data, error: profileError } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("id", user.id)
        .single();
      if (profileError) {
        setError("프로필을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.");
        return;
      }
      setProfile(data);
    });
  }, [supabase]);

  return (
    <main className="app-shell">
      <section className="app-frame">
        <header className="app-header">
          <div className="app-title"><span className="app-title-mark">⚖</span>AI 심판</div>
          <Link aria-label="내 프로필 열기" className="profile-link" href="/profile">
            <Avatar displayName={profile?.display_name ?? "?"} />
            <span className="user-badge">{profile?.display_name ?? "내 프로필"}</span>
          </Link>
        </header>
        <div className="app-content">
          <div className="page-intro"><p className="eyebrow">오늘의 대국</p><h1>시작 화면</h1><p className="muted">두 사람의 대화를 차분히 시작해 볼까요?</p></div>
          {!supabase ? <p className="notice">Supabase 공개 연결값이 아직 설정되지 않았어요.</p> : error ? <p className="notice">{error}</p> : !profile ? <p className="notice">메인을 불러오는 중…</p> : (
            <section className="dashboard-grid">
              <div><h2 className="section-title">진행 중인 미션</h2><article className="card empty-card"><p>진행 중인 미션이 없습니다.</p></article></div>
              <div><h2 className="section-title">진행 중인 대국</h2><article className="card room-card"><span className="tag tag-pending">대국 준비</span><h3>새 대국을 시작할까요?</h3><p className="card-sub">상대와 연결되면 이곳에서 대국을 이어갈 수 있어요.</p><button className="primary-button" disabled type="button">대국 시작하기 · 페이즈 3에서 열려요</button></article></div>
              <div><h2 className="section-title">지난 대국</h2><article className="card empty-card"><p>완료한 대국이 아직 없습니다.</p></article></div>
            </section>
          )}
        </div>
      </section>
    </main>
  );
}
