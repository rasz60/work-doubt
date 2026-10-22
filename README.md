# 운동기록 (work-doubt)

ae:p 포털(`https://ae2p.duckdns.org`)의 **운동기록** 앱입니다. 웹은 포털 아래 `/workout/` 에서 돌고,
같은 코드(Expo)로 iOS / Android 앱도 만들 수 있습니다.

## 포털 안에서의 구조

```
https://ae2p.duckdns.org/workout/*      Caddy ─── app/dist           Expo 웹 빌드 (baseUrl /workout, SPA)
https://ae2p.duckdns.org/api/workout/*  Caddy ─── 127.0.0.1:8091     Go API (pm2: workout-api)
                                                     │
                       공용 Supabase ─ auth.users ───┤ 로그인 토큰 검증 (JWKS 공개키)
                                    └─ workout.*  ───┘ 풀러로 직접 SQL (postgres 역할)
```

- **로그인은 포털이 합니다.** 웹은 포털과 같은 도메인이라 포털의 Supabase 세션을 그대로 쓰고,
  세션이 없으면 포털 로그인(`/login?next=/workout/`)으로 보냅니다. 가입은 포털의 초대로만 됩니다.
- **Go 백엔드는 Supabase access token 을 검증만** 합니다(ES256, 프로젝트 JWKS). 처음 들어온 사용자는
  `workout.profiles` 행을 자동으로 만듭니다. 자체 회원·비밀번호·소셜 로그인 코드는 없습니다.
- **DB 는 공용 Supabase 의 `workout` 스키마**입니다. 브라우저 키(anon/authenticated)로는 못 읽게 막아 두고
  Go 백엔드만 접근합니다. 업무일지의 `public` 스키마는 건드리지 않습니다.
- **네이티브 앱**은 포털이 없으므로 앱 안의 로그인 화면에서 같은 ae:p 계정으로 로그인합니다.

## 기술

| 레이어 | 선택 |
|---|---|
| Frontend | Expo (React Native + React Native Web) + TypeScript, expo-router |
| Backend | Go + 표준 `net/http` (ServeMux 라우팅), pgx/v5 raw SQL |
| Auth | Supabase Auth (ae:p 포털). 백엔드는 JWKS 로 JWT 검증 (`internal/platform/auth/supabase.go`) |
| DB | 공용 Supabase Postgres `workout` 스키마 ([backend/migrations](backend/migrations)) |
| AI | Anthropic Go SDK — 지표를 프롬프트에 넣어 SSE 로 스트리밍 |
| 연동 | Strava API(OAuth, 서버가 가져옴) · 기기 토큰(폰 자동화가 보냄) |

## 디렉터리

```
work-doubt/
├─ backend/                      # Go API
│  ├─ cmd/api/main.go            # 진입점 · 의존성 조립
│  ├─ internal/
│  │  ├─ domain/                 # 엔티티 + 리포지토리 인터페이스
│  │  ├─ usecase/                # account, metric, group, coach, plan, session, activity(잔디 · 통계), sync
│  │  ├─ repository/postgres/    # SQL (workout.* 스키마)
│  │  ├─ platform/               # auth (Supabase JWT 검증), ai (Claude), strava
│  │  ├─ transport/http/         # 라우터 · 핸들러 · 미들웨어
│  │  └─ config/
│  └─ migrations/                # 0001 기본 스키마 · 0002 운동 계획 · 수행 기록 · 연동
├─ app/                          # Expo 클라이언트
│  ├─ public/index.html          # 웹 템플릿: 포털 로딩 화면 + 앱 전환 버튼
│  ├─ app/                       # 화면 (login · (tabs)/ HOME · RECORD · COACH · PROFILE)
│  ├─ src/features/              # calendar(잔디 · 캘린더), record(계획 · 수행 기록 · 신체), profile(연결된 기기)
│  └─ src/api/supabase.ts        # 세션 (포털과 공유)
├─ scripts/deploy.sh             # 서버 배포: Actions 가 빌드한 묶음을 받아 바꿔 끼운다 (서버에서는 빌드하지 않음)
└─ ecosystem.config.cjs          # pm2
```

## 개발

```powershell
# 1회 준비
Copy-Item .env.example .env            # SUPABASE_URL, DATABASE_URL(풀러), ANTHROPIC_API_KEY
Copy-Item app\.env.example app\.env    # EXPO_PUBLIC_SUPABASE_*, EXPO_PUBLIC_API_BASE_URL=http://localhost:8080

# 터미널 1 — 백엔드
. .\scripts\load-env.ps1
cd backend; go run ./cmd/api           # PORT (.env)

# 터미널 2 — 앱
cd app; npm install; npx expo start    # w = 웹. 개발 서버는 포털이 없어 앱의 로그인 화면을 쓴다
```

검증: `cd backend; go vet ./...; go test ./...` / `cd app; npx tsc --noEmit`

DB 까지 확인 (저장소 SQL — 직접 연결 · transaction 풀러 · simple protocol 세 방식):

```bash
docker run -d --name workout-pg -e POSTGRES_PASSWORD=pw -p 55432:5432 postgres:17-alpine
docker exec -i workout-pg psql -U postgres -c "CREATE SCHEMA auth; CREATE TABLE auth.users (id uuid PRIMARY KEY); CREATE ROLE anon; CREATE ROLE authenticated;"
docker exec -i workout-pg psql -U postgres < backend/migrations/0001_workout_schema.sql
docker exec -i workout-pg psql -U postgres < backend/migrations/0002_activity.sql
cd backend && TEST_DATABASE_URL='postgres://postgres:pw@localhost:55432/postgres?sslmode=disable' go test -tags integration ./internal/repository/postgres/
```

## 배포

[docs/DEPLOY.md](docs/DEPLOY.md) — ae:p 서버에 Go·pm2·Caddy, GitHub Actions 자동 배포.

## API (모두 `Authorization: Bearer <Supabase access token>` 필요)

| Method | Path | 설명 |
|---|---|---|
| GET/PATCH | `/api/v1/me` | 프로필 조회/수정 |
| POST/GET | `/api/v1/metrics` | 지표 입력(일자별 upsert) / 목록 |
| GET | `/api/v1/metrics/latest` | 최신 지표 |
| GET | `/api/v1/metrics/series?kind=&from=&to=&user_id=` | 변동폭 차트 데이터 |
| DELETE | `/api/v1/metrics/{id}` | 지표 삭제 |
| POST/GET | `/api/v1/groups` | 그룹 생성 / 내 그룹 |
| POST | `/api/v1/groups/join` | 초대 코드로 참여 |
| GET | `/api/v1/groups/{id}/members` | 구성원 |
| POST/GET | `/api/v1/coach/conversations` | 대화 생성 / 목록 |
| GET | `/api/v1/coach/conversations/{id}/messages` | 대화 내역 |
| POST | `/api/v1/coach/conversations/{id}/ask` | AI 추천 (SSE: delta / done / error) |
| GET/POST | `/api/v1/plans` | 주간 계획 버전 목록(최신 먼저) / 저장(`effective_from` 같으면 덮어씀) |
| DELETE | `/api/v1/plans/{id}` | 계획 버전 삭제 |
| GET/POST | `/api/v1/sessions?from=&to=` | 수행 기록 목록(세트 포함) / 기록 |
| PUT/DELETE | `/api/v1/sessions/{id}` | 기록 고치기 / 삭제 |
| GET | `/api/v1/activity/calendar?from=&to=` | 잔디: 날짜마다 그날 계획 · 기록 · 상태 · 진하기 |
| GET | `/api/v1/activity/summary?month=YYYY-MM` | 목표 대비 칼로리(오늘 · 월), 러닝 · 웨이트 수행 능력 |
| GET | `/api/v1/sync` | 연결된 기기 · Strava 사용 가능 여부 · 기기 전송 주소 |
| POST | `/api/v1/sync/run` | Strava 동기화 (`force` 가 아니면 10분에 한 번) |
| GET | `/api/v1/sync/strava/authorize` | Strava 동의 화면 주소 |
| POST | `/api/v1/sync/devices` | 기기 토큰 만들기 (토큰은 이때 한 번만 보인다) |
| POST | `/api/v1/sync/connections/{id}/import` | Strava 활동 가져오기 `{from, to}` — 날짜(from=to) · 기간 · 전체(둘 다 비움). 이미 있는 기록은 건너뜀 |
| DELETE | `/api/v1/sync/connections/{id}` | 연결 끊기 (받은 기록은 남는다) |
| GET | `/api/v1/sync/strava/callback` | (로그인 없음, 서명된 state) Strava 가 돌려보내는 주소 |
| POST | `/api/v1/sync/ingest` | (로그인 대신 `Bearer wkd_…` 기기 토큰) 폰 자동화가 운동 기록을 보냄 |

포털 아래에서는 앞에 `/api/workout` 이 붙습니다 (Caddy 가 떼고 넘긴다).

## 설계 메모

- **BMI 는 파생값**입니다. `body_metrics.bmi` 를 generated column 으로 두어 DB 가 계산합니다.
- **변동폭 통계**(`first/last/min/max/delta`)는 `usecase.Summarize` 에서 계산하고 유닛 테스트합니다.
- **그룹 공유 권한**은 `group_members.share_data` 로 사용자가 통제하며, 다른 사용자의 차트 조회는
  `GroupRepository.SharesWith` 를 반드시 통과합니다.
- **지표 컬럼명은 화이트리스트 맵**(`metricColumns`)을 거쳐야만 SQL 에 들어갑니다.
- **SSE 를 XHR 로 수신**합니다. React Native 는 `fetch` 의 ReadableStream 을 지원하지 않기 때문입니다.

- **운동 계획은 버전(이력)**입니다. 고칠 때마다 `effective_from` 이 붙은 새 버전이 쌓이고, 잔디는 날짜마다
  그날 적용되던 계획으로 채점합니다(`usecase.PlanFor`). 요일 계획은 `plans.days`(jsonb) 한 칸 — 형식은 `domain.PlanDay`.
- **잔디 채점**(`usecase.Score`): 러닝은 달린 거리 / 목표 거리(거리 없이 시간만 있으면 목표 페이스로 환산),
  웨이트는 한 세트 수 / 계획 세트 수, 계획과 다른 운동만 했으면 일부(30%). 95% 이상이면 완료.
- **칼로리**: 기기 · 사용자가 준 값이 없으면 최근 체중으로 추정합니다(러닝 체중×거리, 웨이트 MET 5 · 세트당 3분).
  목표는 요일 계획의 `target_kcal`, 비우면 계획으로 추정합니다.
- **수행 능력**: 러닝은 Daniels VDOT(거리 · 시간으로 추정한 유산소 능력), 웨이트는 Epley 추정 1RM(맨몸 종목은 최대 횟수).
- **연동 기록은 한 번 들어오면 고치지 않습니다.** 가져올 때 이미 있는 운동은 건너뜁니다(`usecase.IsDuplicate`):
  같은 연결의 같은 활동(external_id)이거나, 출처가 다른데 같은 날 · 같은 종류에 거리(±3%) · 시간(±5%)이 비슷한 기록(직접 입력 · 다른 기기).
  같은 연결에서 온 서로 다른 활동(하루 두 번 달리기)은 따로 들어갑니다.
- **웨이트 입력**은 종목 한 번 + `무게 × 횟수 × 세트` 줄입니다(빠른 입력 `20x5 40x5 60x5x3`). 저장은 세트마다 한 줄(`session_sets`),
  계획은 무게 줄마다 한 항목(`PlannedExercise`)이라 스키마는 그대로입니다 (`app/src/features/record/exercises.ts`).
  기기 토큰은 sha256 만 저장합니다. Strava 토큰은 DB 에 그대로 두므로 `workout` 스키마를 브라우저에 노출하지 않는 규칙이 중요합니다.

## 다음에 채울 것

- AI 코치 프롬프트에 운동 계획 · 최근 수행 기록 넣기 (지금은 신체 지표만)
- 같은 운동을 직접 입력 + 기기로 이중 기록했을 때 알려 주기
- 걸음 수 · 심박 · 수면 등 운동 외 건강 데이터
