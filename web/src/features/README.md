# 기능 모듈

M2부터 `auth`, `invite`, `room`, `message`, `mission`처럼 사용자 기능을 이 폴더 아래에 둔다. 각 모듈은 화면 구성·클라이언트 상태·해당 명령 호출만 담당하며, 권한·상태 전이의 최종 판정은 Supabase Edge Function과 Postgres에 둔다.
