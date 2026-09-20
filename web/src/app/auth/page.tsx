import { Suspense } from "react";
import { AuthScreen } from "@/features/auth/auth-screen";

export default function AuthPage() {
  return <Suspense><AuthScreen /></Suspense>;
}
