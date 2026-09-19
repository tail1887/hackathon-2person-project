# Supabase 연결 경계

- 브라우저에는 `NEXT_PUBLIC_SUPABASE_URL`과 `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`만 쓴다.
- `service_role`과 OAuth 제공자 비밀값은 이 폴더나 브라우저 코드에 두지 않는다.
- M2에서 브라우저 세션 클라이언트와 서버 측 조회 도우미를 추가한다. 상태를 바꾸는 명령은 Edge Function을 호출한다.
