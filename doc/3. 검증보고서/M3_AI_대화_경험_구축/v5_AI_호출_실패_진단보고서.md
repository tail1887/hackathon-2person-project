# M3 AI 대화 경험 구축 — v5 AI 호출 실패 진단보고서

> 상태: AI 심판 스키마 오류 수정·원격 재배포 완료 · 재호출 결과 대기 · 2026-09-21

## 검증 범위

- 운영 `ai_analyses` 기록을 통한 AI 심판·개인 형세·AI 문철 실제 호출 결과
- 실패 원인을 노출하지 않으면서 구분 가능한 운영 진단 정보

## 수행 결과

| 항목 | 결과 | 근거 |
| --- | --- | --- |
| 실제 AI 호출 | 실패 확인 | 운영 `ai_analyses`에 `message_mediation` 4건, `private_position` 1건, `room_review` 1건이 모두 `failed`로 기록됐다. |
| 실패 위치 | OpenAI 요청 단계 | 각 기록은 초안·분석 레코드 생성 뒤 0.3~0.6초 안에 실패했다. 함수의 기존 처리 방식상 이 경로는 OpenAI HTTP 응답 또는 구조화 결과 검증 실패다. |
| 실패 코드 | `openai_http_400` | 보완 배포 뒤의 AI 심판 재호출에서 확인했다. API 키 누락·인증 실패가 아닌 요청 계약 오류다. |
| 원인 | 최상위 `oneOf` 스키마 | AI 심판의 Structured Outputs 스키마가 `oneOf`로 시작했다. OpenAI Structured Outputs는 최상위 스키마가 객체여야 한다. |
| 기존 진단 정보 | 부족 | 기존 함수가 외부 응답 상태를 공통 오류 문구로만 반환·저장해 인증·모델·한도·형식 오류를 구분할 수 없었다. |
| 보완 배포 | 완료 | AI 심판은 최상위 객체 스키마와 서버 측 normal/restricted 검증으로 변경해 원격에 재배포했다. AI 심판·개인 형세·문철 수락·문철 재시도 함수는 실패 시 안전한 `failure_code`만 비공개 분석 기록에 남긴다. 키·입력 본문·외부 오류 본문은 기록하지 않는다. |

## 판정

AI 심판 실패의 첫 원인은 Structured Outputs 스키마 계약 오류로 확인·수정됐다. 재호출이 성공하면 메시지 전송 흐름을 이어서 검증하고, 다시 실패하면 기록되는 `failure_code`를 근거로 키·모델·한도 문제를 분리한다.

## 다음 확인

1. 로그인한 방 멤버가 초안을 입력하고 `확인`을 한 번 실행한다.
2. `ai_analyses.status`가 `ready`이고 결과가 화면에 표시되는지 확인한다.
3. 다시 실패하면 `ai_analyses.result.failure_code`를 확인한다. `openai_http_401`이면 키 교체, `openai_http_404`이면 모델 접근 권한을 확인, `429`이면 사용 한도·결제 상태를 확인한다.

## 근거

- [M3 원격 배포 검증보고서 v4](v4_원격_배포_검증보고서.md)
- [M3 페이즈 4](../../8.%20AI%20대화%20경험%20구축/04_검증과_M4_인계.md)
- [OpenAI Structured Outputs 공식 문서](https://developers.openai.com/api/docs/guides/structured-outputs)
