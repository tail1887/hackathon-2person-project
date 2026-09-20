"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getBrowserSupabase } from "@/lib/supabase/browser";
import { getFunctionErrorMessage } from "@/lib/supabase/function-error";
import { Avatar } from "@/features/profile/avatar";

type Profile = { display_name: string };

export function Dashboard() {
  const supabase = getBrowserSupabase();
  const router = useRouter();
  const [profile, setProfile] = useState<Profile>();
  const [error, setError] = useState<string>();
  const [mode, setMode] = useState<"home" | "start" | "waiting">("home");
  const [inviteCode, setInviteCode] = useState("");
  const [createdInvite, setCreatedInvite] = useState<{ roomId: string; code: string; token: string }>();
  const [isWorking, setIsWorking] = useState(false);

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

  async function createRoom() {
    if (!supabase) return; setIsWorking(true); setError(undefined);
    const { data, error: invokeError } = await supabase.functions.invoke("room-create");
    setIsWorking(false);
    if (invokeError || !data?.ok) { setError(invokeError ? await getFunctionErrorMessage(invokeError, "대국방을 준비하지 못했어요.") : data?.error?.message ?? "대국방을 준비하지 못했어요."); return; }
    setCreatedInvite(data.data); setMode("waiting");
  }
  async function acceptCode() {
    if (!supabase || !/^\d{6}$/.test(inviteCode)) { setError("6자리 초대 코드를 입력해 주세요."); return; }
    setIsWorking(true); setError(undefined);
    const { data, error: invokeError } = await supabase.functions.invoke("invite-accept", { body: { code: inviteCode } });
    setIsWorking(false);
    if (invokeError || !data?.ok) { setError(invokeError ? await getFunctionErrorMessage(invokeError, "사용할 수 없는 초대예요.") : data?.error?.message ?? "사용할 수 없는 초대예요."); return; }
    router.push(`/rooms/${data.data.roomId}`);
  }

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
          {!supabase ? <p className="notice">Supabase 공개 연결값이 아직 설정되지 않았어요.</p> : !profile ? <p className="notice">메인을 불러오는 중…</p> : mode === "start" ? <section className="dashboard-grid"><h2 className="section-title">대국 시작하기</h2><article className="card"><h3>1. 새로운 대국방 만들기</h3><p className="card-sub">상대방을 초대해 새로운 대화를 시작합니다.</p><button className="primary-button" disabled={isWorking} onClick={createRoom} type="button">{isWorking ? "준비 중…" : "대국방 만들기"}</button></article><article className="card"><h3>2. 초대 코드로 입장</h3><p className="card-sub">공유받은 6자리 코드를 입력해 입장합니다.</p><input aria-label="6자리 초대 코드" maxLength={6} onChange={(event) => setInviteCode(event.target.value.replace(/\D/g, ""))} placeholder="예: 123456" value={inviteCode} /><button className="secondary-button" disabled={isWorking} onClick={acceptCode} type="button">초대 코드로 입장</button></article>{error && <p className="notice">{error}</p>}</section> : mode === "waiting" && createdInvite ? <section className="dashboard-grid"><article className="card empty-card"><p aria-hidden="true" style={{fontSize:"2.5rem"}}>💌</p><h2>대국방을 준비했어요</h2><p className="card-sub">상대방에게 초대 링크나 코드를 전달해 주세요.</p><div className="invite-code">{createdInvite.code}</div><p className="notice">상대가 입장하면 자동으로 대국방이 연결됩니다.</p><button className="secondary-button" onClick={() => navigator.clipboard.writeText(`${window.location.origin}/invite/${createdInvite.token}`)} type="button">초대 링크 복사</button></article></section> : (
            <section className="dashboard-grid">
              <div><h2 className="section-title">진행 중인 미션</h2><article className="card empty-card"><p>진행 중인 미션이 없습니다.</p></article></div>
              <div><h2 className="section-title">진행 중인 대국</h2><article className="card room-card"><span className="tag tag-pending">대국 준비</span><h3>새 대국을 시작할까요?</h3><p className="card-sub">상대와 연결되면 이곳에서 대국을 이어갈 수 있어요.</p><button className="primary-button" onClick={() => setMode("start")} type="button">⚔ 대국 시작하기</button></article></div>
              <div><h2 className="section-title">지난 대국</h2><article className="card empty-card"><p>완료한 대국이 아직 없습니다.</p></article></div>
            </section>
          )}
        </div>
      </section>
    </main>
  );
}
