# Edge Functions

상태를 바꾸는 명령과 OpenAI Responses API 호출은 이 폴더의 Edge Function으로만 구현한다. 각 함수는 Supabase Auth 세션, 방 멤버 권한, 현재 상태와 순번을 검증한 뒤 Postgres RPC로 확정한다.

`OPENAI_API_KEY`는 배포된 함수의 비밀값으로만 제공한다. 브라우저와 Next.js 공개 환경 변수에는 절대 넣지 않는다.
