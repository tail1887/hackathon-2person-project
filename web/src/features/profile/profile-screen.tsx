"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { getBrowserSupabase } from "@/lib/supabase/browser";
import { Avatar } from "./avatar";

export function ProfileScreen() {
  const router = useRouter();
  const supabase = getBrowserSupabase();
  const [savedName, setSavedName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [message, setMessage] = useState<string>();
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    void supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      const { data, error } = await supabase.from("profiles").select("display_name").eq("id", user.id).single();
      if (error) { setMessage("프로필을 불러오지 못했어요. 다시 시도해 주세요."); return; }
      setSavedName(data.display_name);
      setDisplayName(data.display_name);
    });
  }, [supabase]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;
    setIsSaving(true);
    setMessage(undefined);
    const { data, error } = await supabase.functions.invoke("profile-update", { body: { displayName } });
    setIsSaving(false);
    if (error || !data?.ok) { setMessage(data?.error?.message ?? "저장하지 못했어요. 다시 시도해 주세요."); return; }
    setSavedName(data.data.displayName);
    setDisplayName(data.data.displayName);
    router.replace("/");
    router.refresh();
  }

  async function signOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
    router.replace("/auth");
    router.refresh();
  }

  const loading = Boolean(supabase) && !savedName && !message;
  return (
    <main className="auth-shell"><section className="auth-card" aria-labelledby="profile-title">
      <p className="eyebrow">내 계정</p><h1 id="profile-title">내 프로필</h1>
      {!supabase ? <p className="notice">Supabase 공개 연결값이 아직 설정되지 않았어요.</p> : loading ? <p className="notice">프로필을 불러오는 중…</p> : <>
        <div className="avatar-preview"><Avatar displayName={displayName || savedName} size="lg" /><p>사진 업로드 없이 표시 이름으로 만든 기본 아바타예요.</p></div>
        <form className="form-stack" onSubmit={save}>
          <label>표시 이름<input maxLength={30} onChange={(event) => setDisplayName(event.target.value)} required value={displayName} /></label>
          <p className="hint">변경한 이름은 이후 새로 만드는 방에만 적용돼요.</p>
          {message && <p aria-live="polite" className="form-message">{message}</p>}
          <div className="button-row"><button onClick={() => { setDisplayName(savedName); router.push("/"); }} type="button">취소</button><button className="primary-button" disabled={isSaving} type="submit">{isSaving ? "저장 중…" : "저장"}</button></div>
        </form>
        <button className="danger-button" onClick={signOut} type="button">로그아웃</button>
      </>}
    </section></main>
  );
}
