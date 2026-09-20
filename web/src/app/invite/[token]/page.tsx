"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getBrowserSupabase } from "@/lib/supabase/browser";
export default function InvitePage() { const { token }=useParams<{token:string}>(); const router=useRouter(); const s=getBrowserSupabase(); const [message,setMessage]=useState("초대를 확인하는 중…"); useEffect(()=>{if(!s)return; void s.functions.invoke("invite-accept",{body:{token}}).then(({data,error})=>{if(error||!data?.ok){setMessage(data?.error?.message??"사용할 수 없는 초대예요.");return;} router.push(`/rooms/${data.data.roomId}`);});},[router,s,token]); return <main className="auth-shell"><p className="notice">{s ? message : "Supabase 연결값이 필요해요."}</p></main>; }
