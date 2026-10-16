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

## 디렉터리

```
work-doubt/
├─ backend/                      # Go API
│  ├─ cmd/api/main.go            # 진입점 · 의존성 조립
│  ├─ internal/
│  │  ├─ domain/                 # 엔티티 + 리포지토리 인터페이스
│  │  ├─ usecase/                # account, metric, group, coach
│  │  ├─ repository/postgres/    # SQL (workout.* 스키마)
│  │  ├─ platform/               # auth (Supabase JWT 검증), ai (Claude)
│  │  ├─ transport/http/         # 라우터 · 핸들러 · 미들웨어
│  │  └─ config/
│  └─ migrations/0001_workout_schema.sql
├─ app/                          # Expo 클라이언트
│  ├─ public/index.html          # 웹 템플릿: 포털 로딩 화면 + 앱 전환 버튼
│  ├─ app/                       # 화면 (login · (tabs)/ 추세 · 기록 · 코치 · 프로필)
│  └─ src/api/supabase.ts        # 세션 (포털과 공유)
├─ scripts/deploy.sh             # 서버 배포 (GitHub Actions 가 호출)
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

포털 아래에서는 앞에 `/api/workout` 이 붙습니다 (Caddy 가 떼고 넘긴다).

## 설계 메모

- **BMI 는 파생값**입니다. `body_metrics.bmi` 를 generated column 으로 두어 DB 가 계산합니다.
- **변동폭 통계**(`first/last/min/max/delta`)는 `usecase.Summarize` 에서 계산하고 유닛 테스트합니다.
- **그룹 공유 권한**은 `group_members.share_data` 로 사용자가 통제하며, 다른 사용자의 차트 조회는
  `GroupRepository.SharesWith` 를 반드시 통과합니다.
- **지표 컬럼명은 화이트리스트 맵**(`metricColumns`)을 거쳐야만 SQL 에 들어갑니다.
- **SSE 를 XHR 로 수신**합니다. React Native 는 `fetch` 의 ReadableStream 을 지원하지 않기 때문입니다.

## 다음에 채울 것

- 운동 세션/종목 기록 (현재는 신체 지표만)
- 폰·워치의 건강 데이터(걸음 수, 운동, 심박, 수면) 가져오기
