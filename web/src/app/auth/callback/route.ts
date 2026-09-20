import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabasePublicEnv } from "@/lib/supabase/env";

function getSafeDestination(request: NextRequest) {
  const next = request.nextUrl.searchParams.get("next");
  return next?.startsWith("/") && !next.startsWith("//") ? next : "/";
}

export async function GET(request: NextRequest) {
  const destination = request.nextUrl.clone();
  destination.pathname = getSafeDestination(request);
  destination.search = "";

  const response = NextResponse.redirect(destination);
  const env = getSupabasePublicEnv();
  const code = request.nextUrl.searchParams.get("code");

  if (!env || !code) {
    const authUrl = request.nextUrl.clone();
    authUrl.pathname = "/auth";
    authUrl.search = "";
    authUrl.searchParams.set("error", "oauth_callback_failed");
    response.headers.set("location", authUrl.toString());
    return response;
  }

  const supabase = createServerClient(env.url, env.publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    const authUrl = request.nextUrl.clone();
    authUrl.pathname = "/auth";
    authUrl.search = "";
    authUrl.searchParams.set("error", "oauth_callback_failed");
    response.headers.set("location", authUrl.toString());
  }

  return response;
}
