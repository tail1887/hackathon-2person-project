import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

const publicPaths = new Set(["/auth", "/auth/callback"]);

export async function proxy(request: NextRequest) {
  if (publicPaths.has(request.nextUrl.pathname)) {
    const result = await updateSession(request);
    return result instanceof NextResponse ? result : result.response;
  }

  const result = await updateSession(request);
  if (result instanceof NextResponse) {
    return result;
  }

  if (!result.user) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth";
    url.search = "";
    url.searchParams.set("next", `${request.nextUrl.pathname}${request.nextUrl.search}`);
    const redirectResponse = NextResponse.redirect(url);
    result.response.cookies.getAll().forEach((cookie) => redirectResponse.cookies.set(cookie));
    return redirectResponse;
  }

  return result.response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
