"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getBrowserSupabase } from "@/lib/supabase/browser";

export function CallbackScreen() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = getBrowserSupabase();
  const code = searchParams.get("code");
  const [message, setMessage] = useState("로그인 정보를 확인하는 중…");

  useEffect(() => {
    if (!supabase) return;
    const next = searchParams.get("next");
    const destination = next?.startsWith("/") && !next.startsWith("//") ? next : "/";
    if (!code) {
      return;
    }
    void supabase.auth.exchangeCodeForSession(code).then(({ error }) => {
      if (error) {
        setMessage("로그인을 완료하지 못했어요. 다시 시도해 주세요.");
        return;
      }
      router.replace(destination);
      router.refresh();
    });
  }, [code, router, searchParams, supabase]);

  const displayMessage = !supabase
    ? "Supabase 공개 연결값이 아직 설정되지 않았어요."
    : !code
      ? "로그인 인증 코드가 없어 다시 시도해 주세요."
      : message;

  return <main className="auth-shell"><p className="notice">{displayMessage}</p></main>;
}
