# M2 대국방 기반 구축 — v4 Kakao 동의 항목 재검증보고서

> 상태: 미통과 · 2026-09-20

## 검증 범위

- Kakao `profile_image` 동의 항목을 선택 동의로 변경한 뒤 운영 카카오 로그인 재시도

## 수행 결과

| 확인 항목 | 방법 | 결과 | 근거 |
| --- | --- | --- | --- |
| `profile_nickname` 동의 | Kakao Developers 동의항목 화면 확인 | 통과 | 선택 동의 |
| `profile_image` 동의 | 선택 동의·동의 목적 저장 후 상태 확인 | 통과 | Kakao Developers 동의항목 화면 |
| Kakao OAuth 인가 | 운영 로그인 화면에서 카카오 로그인 재시도 | 미통과 | KOE205 지속 |
| 원인 분리 | 실제 인가 요청 범위와 Kakao 앱 동의 상태 대조 | 확인 | 요청 범위에 `account_email`이 포함되지만 앱은 해당 항목 권한 없음 |

## 남은 위험과 다음 결정

- Supabase의 현재 Kakao 공급자 인가 요청은 `account_email profile_image profile_nickname`을 포함한다. 카카오 앱은 `account_email`이 권한 없음이라 공개 로그인에서 KOE205가 발생한다.
- 이메일 없는 사용자를 허용하는 제품 정책은 유지한다. 다만 실제 공개 Kakao 로그인을 위해서는 다음 중 하나를 선택해야 한다.
  - 카카오 앱의 이메일 동의 권한을 확보한다. 공개 서비스라면 비즈 앱 전환·권한 절차가 필요할 수 있다.
  - Supabase 기본 Kakao 공급자 대신 이메일 범위를 요청하지 않는 별도 OAuth/OIDC 연동을 구현한다.

## 완료 확인

- [x] 프로필 사진 동의 항목 보완
- [x] 운영 Kakao 로그인 재검증
- [x] 실패 범위와 다음 결정 분리
- [ ] Kakao OAuth 운영 로그인 성공
