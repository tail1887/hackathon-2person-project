# 커플들이 집착하는 AI 심판이 되었다

두 사람이 대국처럼 대화하고, AI 심판의 문장 제안·개인 형세 파악·공용 AI 문철을 거쳐 조건부 무승부 협상과 공동/개인 미션으로 대화를 끝맺는 웹 MVP다.

## 현재 상태

- M0~M4 구현 및 두 계정 수동 테스트 완료
- 다음 단계: M5 데모 완성·반응형·권한 QA
- 운영 주소: https://web-five-ivory-44.vercel.app

## 주요 흐름

1. Google 또는 이메일·비밀번호로 로그인한다.
2. 초대 링크 또는 6자리 코드로 두 사용자가 대국방에 연결된다.
3. 메시지 초안은 AI 심판 확인 뒤 원문 또는 추천문으로만 전송한다.
4. 필요할 때 개인 형세 파악과 함께 보는 AI 문철을 사용한다.
5. 조건부 무승부를 제안·카운터오퍼·수락하고, 선택된 조건만 미션으로 만든다.
6. 종료된 대국의 미션은 별도 미션 페이지에서 완료·확인·수정 제안으로 처리한다.

## 기술 구성

- Frontend: Next.js App Router, TypeScript
- Backend: Supabase Auth, Postgres, RLS, Realtime Broadcast, Edge Functions
- AI: OpenAI Responses API (Edge Function에서만 호출)
- Deploy: Vercel

## 로컬 실행과 검증

```bash
cd web
npm install
cp .env.example .env.local
npm run dev
npm run lint
npx tsc --noEmit
npm run build
```

`.env.local`에는 공개 Supabase 연결값만 둔다. OpenAI API 키와 Supabase service role 키는 `supabase/.env.local` 또는 Vercel/Supabase 비밀값으로 관리한다.

## 저장소와 문서

- `web/` — Next.js 서비스 화면과 브라우저 명령
- `supabase/` — 마이그레이션, RLS, RPC, Edge Functions
- `mockup/` — 확정 UI 구조의 인터랙티브 기준 목업
- `doc/` — 기획·명세·결정·마일스톤·검증 이력

- [MVP 명세](doc/1_MVP_명세.md)
- [시스템·데이터 정의](doc/3_시스템_데이터_정의.md)
- [의사결정 로그](doc/1.%20의사결정%20로그/README.md)
- [마일스톤 계획](doc/2_마일스톤_계획.md)
- [M4 완료 검증보고서](doc/3.%20검증보고서/M4_무승부_협상·미션_완주/v1_검증보고서.md)

UI 구현은 [목업](mockup/index.html)의 화면 구조·정보 순서·상태 문구를 기준으로 한다.
