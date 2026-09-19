# 커플들이 집착하는 AI 심판이 되었다

Next.js·Supabase·OpenAI Responses API·Vercel 조합으로 만드는 2인 대국형 AI 메신저 MVP다.

## 시작하기

```bash
cd web
npm install
cp .env.example .env.local
npm run dev
```

환경 값을 아직 넣지 않아도 빈 앱은 실행된다. Supabase 프로젝트 연결, OAuth 제공자 설정, Edge Function 비밀값 입력과 Vercel 배포는 M1.3 페이즈 4에서 검증한다.

## 구조

- `web/`: Vercel Root Directory로 지정할 Next.js 앱
- `supabase/`: Postgres 마이그레이션과 Edge Function의 배포 단위
- `doc/`: 확정 기준과 마일스톤 기록
- `mockup/`: M1.2 인터랙티브 목업

자세한 책임과 환경 변수 규칙은 [프로젝트 뼈대](doc/6.%20기술%20스택·프로젝트%20뼈대/03_프로젝트_뼈대.md)를 따른다.
