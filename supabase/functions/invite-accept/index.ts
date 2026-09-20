import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const digest = async (value: string) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))), (byte) => byte.toString(16).padStart(2, "0")).join("");
const messages: Record<string,string> = { invite_expired_or_revoked:"초대 기간이 끝났어요.", invite_used_or_full:"이미 두 사람이 입장한 대국방이에요.", active_room_exists:"이미 진행 중인 대국이 있어요.", invalid_invite:"사용할 수 없는 초대예요." };
const headers = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
Deno.serve(async (request) => {
 if(request.method === "OPTIONS") return new Response("ok", { headers });
 if(request.method !== "POST") return json({ok:false,error:{code:"method_not_allowed",message:"허용하지 않는 요청이에요."}},405);
 const authorization=request.headers.get("Authorization"); if(!authorization) return json({ok:false,error:{code:"unauthenticated",message:"로그인이 필요해요."}},401);
 const supabaseUrl=Deno.env.get("SUPABASE_URL")!, supabaseAnonKey=Deno.env.get("SUPABASE_ANON_KEY")!, accessToken=authorization.replace(/^Bearer\s+/i,"");
 const auth=createClient(supabaseUrl,supabaseAnonKey); const {data:{user},error:authError}=await auth.auth.getUser(accessToken);
 if(authError||!user) return json({ok:false,error:{code:"unauthenticated",message:"로그인이 필요해요."}},401);
 const {code,token}=await request.json().catch(()=>({})); const validCode=typeof code==="string"&&/^\d{6}$/.test(code); const validToken=typeof token==="string"&&token.length>20;
 if(!validCode&&!validToken) return json({ok:false,error:{code:"invalid_invite",message:messages.invalid_invite}},400);
 const client=createClient(supabaseUrl,supabaseAnonKey,{global:{headers:{Authorization:authorization}}});
 const {data,error}=await client.rpc("accept_pending_invite",{p_code:validCode?code:null,p_token_digest:validToken?await digest(token):null}); const result=data?.[0]; const errorCode=result?.error_code ?? (error ? "invalid_invite" : null);
 if(errorCode) return json({ok:false,error:{code:errorCode,message:messages[errorCode]??messages.invalid_invite}},400);
 return json({ok:true,data:{roomId:result.room_id}});
});
