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
      <header className="app-header">
        <div><p className="eyebrow">오늘의 대국</p><h1>시작 화면</h1></div>
        <Link aria-label="내 프로필 열기" className="profile-link" href="/profile">
          <Avatar displayName={profile?.display_name ?? "?"} />
          <span>{profile?.display_name ?? "내 프로필"}</span>
        </Link>
      </header>
      {!supabase ? <p className="notice">Supabase 공개 연결값이 아직 설정되지 않았어요.</p> : error ? <p className="notice">{error}</p> : !profile ? <p className="notice">메인을 불러오는 중…</p> : (
        <section className="dashboard-grid">
          <article><h2>진행 중인 미션</h2><p>진행 중인 미션이 없어요.</p></article>
          <article><h2>진행 중인 대국</h2><p>진행 중인 대국이 없어요.</p><button className="primary-button" disabled type="button">대국 시작하기 · 페이즈 3에서 열려요</button></article>
          <article><h2>지난 대국</h2><p>완료한 대국이 아직 없어요.</p></article>
        </section>
      )}
    </main>
  );
}
