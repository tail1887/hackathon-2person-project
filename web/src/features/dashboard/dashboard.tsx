"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getBrowserSupabase } from "@/lib/supabase/browser";
import { getFunctionErrorMessage } from "@/lib/supabase/function-error";

type Profile = { display_name: string };
type ActiveRoom = { id: string; status: "active" };
type ActiveMission = {
  id: string;
  room_id: string;
  kind: "individual" | "joint";
  text: string;
  due_date: string | null;
  status: "in_progress" | "completion_requested" | "revision_requested";
};

export function Dashboard() {
  const supabase = getBrowserSupabase();
  const router = useRouter();
  const [profile, setProfile] = useState<Profile>();
  const [activeRoom, setActiveRoom] = useState<ActiveRoom | null>();
  const [isRoomLoading, setIsRoomLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [mode, setMode] = useState<"home" | "start" | "waiting">("home");
  const [inviteCode, setInviteCode] = useState("");
  const [createdInvite, setCreatedInvite] = useState<{
    inviteId: string;
    code: string;
    token: string;
  }>();
  const [copyMessage, setCopyMessage] = useState<string>();
  const [isWorking, setIsWorking] = useState(false);
  const [missions, setMissions] = useState<ActiveMission[]>([]);

  useEffect(() => {
    if (!supabase) return;
    void supabase.auth
      .getUser()
      .then(async ({ data: { user }, error: userError }) => {
        if (userError || !user) {
          setError("로그인 정보를 불러오지 못했어요.");
          return;
        }
        const [
          { data, error: profileError },
          { data: rooms, error: roomError },
          { data: activeMissions, error: missionError },
        ] = await Promise.all([
          supabase
            .from("profiles")
            .select("display_name")
            .eq("id", user.id)
            .single(),
          supabase
            .from("room_public")
            .select("id, status")
            .eq("status", "active")
            .order("activated_at", { ascending: false })
            .limit(1),
          supabase
            .from("mission_public")
            .select("id,room_id,kind,text,due_date,status")
            .in("status", [
              "in_progress",
              "completion_requested",
              "revision_requested",
            ])
            .order("updated_at", { ascending: false }),
        ]);
        if (profileError) {
          setError("프로필을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.");
          return;
        }
        setProfile(data);
        if (roomError) {
          setError(
            "진행 중인 대국을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.",
          );
        } else {
          setActiveRoom((rooms?.[0] as ActiveRoom | undefined) ?? null);
        }
        if (!missionError)
          setMissions((activeMissions ?? []) as ActiveMission[]);
        setIsRoomLoading(false);
      });
  }, [supabase]);

  useEffect(() => {
    if (!supabase || mode !== "waiting" || !createdInvite) return;
    const channel = supabase
      .channel(`invite:${createdInvite.inviteId}`, {
        config: { private: true },
      })
      .on("broadcast", { event: "room.member_joined" }, ({ payload }) => {
        const roomId = (payload as { room_id?: string }).room_id;
        if (roomId) router.push(`/rooms/${roomId}`);
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [createdInvite, mode, router, supabase]);

  async function createRoom() {
    if (!supabase) return;
    setIsWorking(true);
    setError(undefined);
    const { data, error: invokeError } =
      await supabase.functions.invoke("room-create");
    setIsWorking(false);
    if (invokeError || !data?.ok) {
      setError(
        invokeError
          ? await getFunctionErrorMessage(
              invokeError,
              "초대를 준비하지 못했어요.",
            )
          : (data?.error?.message ?? "초대를 준비하지 못했어요."),
      );
      return;
    }
    setCreatedInvite(data.data);
    setMode("waiting");
  }
  async function acceptCode() {
    if (!supabase || !/^\d{6}$/.test(inviteCode)) {
      setError("6자리 초대 코드를 입력해 주세요.");
      return;
    }
    setIsWorking(true);
    setError(undefined);
    const { data, error: invokeError } = await supabase.functions.invoke(
      "invite-accept",
      { body: { code: inviteCode } },
    );
    setIsWorking(false);
    if (invokeError || !data?.ok) {
      setError(
        invokeError
          ? await getFunctionErrorMessage(
              invokeError,
              "사용할 수 없는 초대예요.",
            )
          : (data?.error?.message ?? "사용할 수 없는 초대예요."),
      );
      return;
    }
    router.push(`/rooms/${data.data.roomId}`);
  }
  async function copyInviteLink() {
    if (!createdInvite) return;
    const inviteLink = `${window.location.origin}/invite/${createdInvite.token}`;
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopyMessage("초대 링크를 복사했어요.");
    } catch {
      setCopyMessage(
        "복사가 제한됐어요. 아래 링크를 열거나 직접 복사해 주세요.",
      );
    }
  }

  return (
    <main className="app-shell">
      <section className="app-frame mockup-app-frame">
        <header className="app-header">
          <span className="btn-icon-placeholder" aria-hidden="true">
            ←
          </span>
          <Link aria-label="메인으로 돌아가기" className="app-title" href="/">
            ⚖️ AI 심판
          </Link>
          <Link
            aria-label="내 프로필 열기"
            className="btn-icon"
            href="/profile"
          >
            👤
          </Link>
        </header>
        <div className="app-content dashboard-screen">
          {!supabase ? (
            <p className="notice">
              Supabase 공개 연결값이 아직 설정되지 않았어요.
            </p>
          ) : !profile ? (
            <p className="notice">메인을 불러오는 중…</p>
          ) : mode === "start" && !activeRoom ? (
            <section className="dashboard-grid">
              <h1 className="section-title dashboard-heading">대국 시작하기</h1>
              <article className="card">
                <h2>1. 새로운 대국방 만들기</h2>
                <p className="card-sub">
                  상대방을 초대하여 새로운 대국을 진행합니다.
                </p>
                <button
                  className="btn btn-primary btn-block dashboard-card-action"
                  disabled={isWorking}
                  onClick={createRoom}
                  type="button"
                >
                  {isWorking ? "대국방을 준비하는 중…" : "대국방 만들기"}
                </button>
              </article>
              <article className="card">
                <h2>2. 초대 코드로 입장</h2>
                <p className="card-sub">
                  공유받은 6자리 입장 코드를 입력해 입장합니다.
                </p>
                <input
                  aria-label="6자리 초대 코드"
                  maxLength={6}
                  onChange={(event) =>
                    setInviteCode(event.target.value.replace(/\D/g, ""))
                  }
                  placeholder="6자리 초대 코드 (예: 123456)"
                  value={inviteCode}
                />
                <button
                  className="btn btn-outline btn-block dashboard-card-action"
                  disabled={isWorking}
                  onClick={acceptCode}
                  type="button"
                >
                  초대 코드로 입장
                </button>
              </article>
              {error && <p className="notice">{error}</p>}
            </section>
          ) : mode === "waiting" && createdInvite ? (
            <section className="dashboard-grid">
              <article className="card empty-card mockup-center-card">
                <p aria-hidden="true" className="invite-icon">
                  💌
                </p>
                <h1>대국방을 준비했어요</h1>
                <p className="card-sub">
                  상대방에게 초대 링크나 코드를 전달해 주세요.
                </p>
                <div className="invite-code">
                  <span>입장 코드</span>
                  {createdInvite.code}
                </div>
                <p className="notice-box">
                  상대가 입장하면 자동으로 대국방이 연결됩니다.
                </p>
                <button
                  className="btn btn-secondary btn-block"
                  onClick={copyInviteLink}
                  type="button"
                >
                  초대 링크 복사
                </button>
                <a
                  className="btn btn-outline btn-block"
                  href={`/invite/${createdInvite.token}`}
                >
                  초대 링크 열기
                </a>
                {copyMessage && (
                  <p aria-live="polite" className="hint">
                    {copyMessage}
                  </p>
                )}
              </article>
            </section>
          ) : (
            <section className="dashboard-grid dashboard-home">
              <div>
                <h1 className="section-title dashboard-heading">
                  📌 활성 미션 <span>(우선 표시)</span>
                </h1>
                {missions.length === 0 ? (
                  <article className="card empty-card">
                    <p>진행 중인 미션이 없습니다.</p>
                  </article>
                ) : (
                  <div className="dashboard-mission-list">
                    {missions.map((mission) => (
                      <article
                        className="card dashboard-mission-card"
                        key={mission.id}
                      >
                        <div>
                          <span className="tag tag-active">
                            {mission.status === "completion_requested"
                              ? "상대 확인 대기"
                              : mission.status === "revision_requested"
                                ? "재수행 요청됨"
                                : "진행 중"}
                          </span>
                          <h2>
                            {mission.kind === "joint"
                              ? "🤝 공동 퀘스트"
                              : "🎯 개인 미션"}
                          </h2>
                          <p>{mission.text}</p>
                          <p className="hint">
                            {mission.due_date
                              ? `${mission.due_date.replaceAll("-", ".")}까지`
                              : "기한 없음"}
                          </p>
                        </div>
                        <button
                          className="btn btn-sm btn-primary"
                          onClick={() =>
                            router.push(`/rooms/${mission.room_id}`)
                          }
                          type="button"
                        >
                          미션 보기
                        </button>
                      </article>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <h1 className="section-title dashboard-heading">
                  ⚔️ 대국 목록
                </h1>
                {isRoomLoading ? (
                  <article className="card empty-card">
                    <p>진행 중인 대국을 불러오는 중…</p>
                  </article>
                ) : activeRoom ? (
                  <article className="card room-card">
                    <div className="room-card-title">
                      <div>
                        <span className="tag tag-active">진행 중 대국</span>
                        <h2>진행 중인 대국</h2>
                      </div>
                      <button
                        className="btn btn-sm btn-primary"
                        onClick={() => router.push(`/rooms/${activeRoom.id}`)}
                        type="button"
                      >
                        대국 재개
                      </button>
                    </div>
                  </article>
                ) : (
                  <article className="card empty-card">
                    <p>진행 중인 대국이 없습니다.</p>
                  </article>
                )}
              </div>
              <div className="dashboard-footer-actions">
                <Link className="btn btn-outline" href="/profile">
                  내 프로필
                </Link>
                <button
                  className="btn btn-primary"
                  disabled={Boolean(activeRoom)}
                  onClick={() => setMode("start")}
                  type="button"
                >
                  ⚔️ 대국 시작하기
                </button>
              </div>
            </section>
          )}
        </div>
      </section>
    </main>
  );
}
