# Edge Functions

상태를 바꾸는 명령과 OpenAI Responses API 호출은 이 폴더의 Edge Function으로만 구현한다. 각 함수는 Supabase Auth 세션, 방 멤버 권한, 현재 상태와 순번을 검증한 뒤 Postgres RPC로 확정한다.

`OPENAI_API_KEY`는 배포된 함수의 비밀값으로만 제공한다. 브라우저와 Next.js 공개 환경 변수에는 절대 넣지 않는다.

`profile-update`는 로그인 세션에서 확인한 사용자 자신의 `profiles.display_name`만 갱신한다. 함수는 배포 환경의 `SUPABASE_SERVICE_ROLE_KEY`를 사용하므로 이 값도 저장소·브라우저·채팅에 기록하지 않는다.
