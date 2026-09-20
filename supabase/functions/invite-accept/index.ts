import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const digest = async (value: string) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))), (byte) => byte.toString(16).padStart(2, "0")).join("");
const messages: Record<string,string> = { invite_expired_or_revoked:"초대 기간이 끝났어요.", invite_used_or_full:"이미 두 사람이 입장한 대국방이에요.", active_room_exists:"이미 진행 중인 대국이 있어요.", invalid_invite:"사용할 수 없는 초대예요." };
Deno.serve(async (request) => {
 const authorization=request.headers.get("Authorization"); if(!authorization) return new Response(JSON.stringify({ok:false,error:{code:"unauthenticated",message:"로그인이 필요해요."}}),{status:401});
 const {code,token}=await request.json().catch(()=>({})); const validCode=typeof code==="string"&&/^\d{6}$/.test(code); const validToken=typeof token==="string"&&token.length>20;
 if(!validCode&&!validToken) return new Response(JSON.stringify({ok:false,error:{code:"invalid_invite",message:messages.invalid_invite}}),{status:400});
 const client=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_ANON_KEY")!,{global:{headers:{Authorization:authorization}}});
 const {data,error}=await client.rpc("accept_invite",{p_code:validCode?code:null,p_token_digest:validToken?await digest(token):null}); const result=data?.[0]; const errorCode=result?.error_code ?? (error ? "invalid_invite" : null);
 if(errorCode) return new Response(JSON.stringify({ok:false,error:{code:errorCode,message:messages[errorCode]??messages.invalid_invite}}),{status:400});
 return new Response(JSON.stringify({ok:true,data:{roomId:result.room_id}}),{headers:{"Content-Type":"application/json"}});
});
