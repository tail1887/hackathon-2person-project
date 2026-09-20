"use client";

import { useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getBrowserSupabase } from "@/lib/supabase/browser";

type Mode = "signIn" | "signUp";

function safeNext(value: string | null) {
  return value?.startsWith("/") && !value.startsWith("//") ? value : "/";
}

export function AuthScreen() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<Mode>("signIn");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string>();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const next = safeNext(searchParams.get("next"));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const supabase = getBrowserSupabase();
    if (!supabase) {
      setMessage("Supabase 공개 연결값을 설정한 뒤 다시 시도해 주세요.");
      return;
    }

    setIsSubmitting(true);
    setMessage(undefined);
    const result = mode === "signIn"
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
        });
    setIsSubmitting(false);

    if (result.error) {
      setMessage(result.error.message);
      return;
    }

    if (mode === "signUp" && !result.data.session) {
      setMessage("인증 메일을 확인한 뒤 로그인해 주세요.");
      return;
    }

    router.replace(next);
    router.refresh();
  }

  async function signInWith(provider: "kakao" | "google") {
    const supabase = getBrowserSupabase();
    if (!supabase) {
      setMessage("Supabase 공개 연결값을 설정한 뒤 다시 시도해 주세요.");
      return;
    }

    setIsSubmitting(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
    });
    if (error) {
      setMessage(error.message);
      setIsSubmitting(false);
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-card" aria-labelledby="auth-title">
        <p className="eyebrow">대국을 시작하기 전에</p>
        <h1 id="auth-title">{mode === "signIn" ? "로그인" : "회원가입"}</h1>
        <p className="muted">대화는 로그인한 두 사람만 함께 볼 수 있어요.</p>

        <form className="form-stack" onSubmit={submit}>
          <label>
            이메일
            <input autoComplete="email" onChange={(event) => setEmail(event.target.value)} required type="email" value={email} />
          </label>
          <label>
            비밀번호
            <input autoComplete={mode === "signIn" ? "current-password" : "new-password"} minLength={6} onChange={(event) => setPassword(event.target.value)} required type="password" value={password} />
          </label>
          <button className="primary-button" disabled={isSubmitting} type="submit">
            {isSubmitting ? "처리 중…" : mode === "signIn" ? "로그인" : "회원가입"}
          </button>
        </form>

        <div className="divider">또는</div>
        <div className="social-buttons">
          <button disabled={isSubmitting} onClick={() => signInWith("kakao")} type="button">카카오로 계속</button>
          <button disabled={isSubmitting} onClick={() => signInWith("google")} type="button">구글로 계속</button>
        </div>
        {message && <p aria-live="polite" className="form-message">{message}</p>}
        <button className="text-button" onClick={() => { setMode(mode === "signIn" ? "signUp" : "signIn"); setMessage(undefined); }} type="button">
          {mode === "signIn" ? "처음이신가요? 회원가입" : "이미 계정이 있나요? 로그인"}
        </button>
      </section>
    </main>
  );
}
