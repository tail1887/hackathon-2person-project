# 웹 앱

이 폴더는 Vercel의 Root Directory로 배포할 Next.js App Router 앱이다.

## 로컬 실행

```bash
npm run dev
```

브라우저에서 `http://localhost:3000`을 연다. M2 페이즈 2의 로그인·내 프로필 화면이 포함되어 있다. 대국방 생성·초대·실시간 메시지는 이후 페이즈에서 추가한다.

## 환경 변수

`cp .env.example .env.local`로 공개 Supabase 연결값의 빈 파일을 만든다. `NEXT_PUBLIC_` 값만 브라우저에서 사용할 수 있다.

OpenAI API 키와 Supabase service role 키는 이 폴더에 넣지 않는다. 서버 전용 값은 `supabase/.env.local` 또는 배포 플랫폼 비밀값에서 관리한다.

원격 검증 전에는 프로젝트 소유자가 `supabase/migrations/20260920000100_create_profiles.sql`과 `profile-update` Edge Function을 배포하고, 로컬·Vercel에 위 공개 연결값을 설정해야 한다. 구글 Client Secret은 어떤 환경 파일에도 기록하지 않는다.

## 구조

- `src/app/`: 화면과 라우트
- `src/contracts/`: 공통 요청·응답 형식
- `src/features/`: 기능 단위 UI·명령 호출
- `src/lib/supabase/`: 공개 연결값과 Supabase 연결 도우미

전체 구현 경계는 상위 [프로젝트 README](../README.md)와 [M1.3 페이즈 3 문서](../doc/6.%20기술%20스택·프로젝트%20뼈대/03_프로젝트_뼈대.md)를 따른다.
