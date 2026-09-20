import { Suspense } from "react";
import { CallbackScreen } from "@/features/auth/callback-screen";

export default function AuthCallbackPage() {
  return <Suspense><CallbackScreen /></Suspense>;
}
