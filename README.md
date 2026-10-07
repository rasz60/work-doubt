# Workout — 운동 기록 앱 (골격)

Web / iOS / Android 를 하나의 코드베이스로 커버하는 운동 기록 앱의 기본 골격입니다.

## 기술 선택

| 레이어 | 선택 | 이유 |
|---|---|---|
| Frontend | Expo (React Native + React Native Web) + TypeScript | 3개 플랫폼 단일 코드베이스. 웹은 `expo start --web`, 네이티브는 동일 소스로 빌드 |
| Routing | expo-router | 파일 기반 라우팅 + 딥링크(소셜 로그인 리디렉트)에 필요 |
| Chart | react-native-svg 직접 구현 | 차트 라이브러리의 웹/네이티브 렌더링 편차 제거, 변동폭 전용 최소 구현 |
| Backend | Go 1.24 + 표준 `net/http` (1.22 ServeMux 라우팅) | 외부 프레임워크 없이 Clean Architecture, SSE 스트리밍에 유리, 단일 바이너리 배포 |
| DB | Supabase (관리형 PostgreSQL) + pgx/v5 (raw SQL) | 지표 시계열 조회와 그룹 조인에 적합, 인덱스/쿼리 직접 제어. Supabase 는 Postgres 로만 사용(Auth·PostgREST 미사용) |
| Auth | JWT access + opaque refresh (rotation) | 모바일/웹 공용. refresh 는 sha256 해시만 저장 |
| AI | Anthropic Go SDK, `claude-opus-5` | 대화형 운동 추천. 지표를 프롬프트에 주입하고 SSE 로 스트리밍 |

## 디렉터리

```
workout/
├─ backend/                      # Go API
│  ├─ cmd/api/main.go            # 진입점 · 의존성 조립 · graceful shutdown
│  ├─ internal/
│  │  ├─ domain/                 # 엔티티 + 리포지토리 인터페이스 (의존성 없음)
│  │  ├─ usecase/                # 비즈니스 로직 (auth, metric, group, coach)
│  │  ├─ repository/postgres/    # SQL 구현
│  │  ├─ platform/               # 외부 I/O (auth/jwt, oauth, ai/claude)
│  │  ├─ transport/http/         # 라우터 · 핸들러 · 미들웨어
│  │  └─ config/                 # 환경변수 로딩
│  └─ migrations/0001_init.sql
└─ app/                          # Expo 클라이언트
   ├─ app/                       # expo-router 화면
   │  ├─ login.tsx
   │  └─ (tabs)/                 # 변동폭 · 기록 · AI 코치 · 프로필
   └─ src/
      ├─ api/                    # HTTP 클라이언트 · SSE 스트림 · 토큰 저장소
      ├─ components/             # TrendChart, 공용 UI
      ├─ hooks/useAuth.tsx       # 세션 컨텍스트
      └─ types.ts                # 서버 스키마와 1:1 타입
```

의존 방향은 `transport → usecase → domain ← repository/platform` 한 방향입니다.
`domain` 은 어떤 외부 패키지도 import 하지 않습니다.

## 문서

| 문서 | 내용 |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | 기술 선택 근거, 레이어 규칙, 데이터 모델과 인덱스 설계, 설계 결정 메모 |
| [docs/RUN.md](docs/RUN.md) | 실행 가이드 (플랫폼별 API 주소, API 스모크 테스트, 소셜 로그인 설정, 문제 해결) |

## 빠르게 실행

DB 는 **Supabase**(`hsykrtillmitbhkyzruq`)를 사용합니다. 로컬 Docker 는 필요 없습니다.

```powershell
# 1회 준비
Copy-Item .env.example .env
#  ① DATABASE_URL — Supabase 대시보드 [Connect] → Session pooler 문자열
#     (direct 호스트 db.*.supabase.co 는 IPv6 전용이라 쓸 수 없습니다)
#  ② JWT_SECRET  — 32바이트 이상, 없으면 서버가 기동하지 않습니다
"EXPO_PUBLIC_API_BASE_URL=http://localhost:8080" | Out-File -Encoding utf8 app\.env

# 스키마 적용: 아래를 복사해 Supabase SQL Editor 에 붙여넣고 Run (1회)
Get-Content backend\migrations\0001_init.sql -Raw | Set-Clipboard

# 터미널 1 — 백엔드
. .\scripts\load-env.ps1             # .env 를 셸 환경변수로 (맨 앞 점 필수)
cd backend; go run ./cmd/api         # :8080

# 터미널 2 — 앱
cd app; npm install; npx expo start  # w = 웹, a = Android, i = iOS
```

자세한 설명과 막혔을 때의 대처는 [docs/RUN.md](docs/RUN.md) 에 있습니다.

## API

| Method | Path | 설명 |
|---|---|---|
| POST | `/api/v1/auth/register` | 이메일 가입 |
| POST | `/api/v1/auth/login` | 이메일 로그인 |
| POST | `/api/v1/auth/social/{provider}` | 구글/카카오/네이버 code 교환 |
| POST | `/api/v1/auth/refresh` | refresh token 교체 |
| POST | `/api/v1/auth/logout` | refresh token 전체 폐기 |
| GET/PATCH | `/api/v1/me` | 프로필 조회/수정 |
| POST/GET | `/api/v1/metrics` | 지표 입력(일자별 upsert) / 목록 |
| GET | `/api/v1/metrics/latest` | 최신 지표 |
| GET | `/api/v1/metrics/series?kind=&from=&to=&user_id=` | **변동폭 차트 데이터** |
| DELETE | `/api/v1/metrics/{id}` | 지표 삭제 |
| POST/GET | `/api/v1/groups` | 그룹 생성 / 내 그룹 |
| POST | `/api/v1/groups/join` | 초대 코드로 참여 |
| GET | `/api/v1/groups/{id}/members` | 구성원 |
| POST/GET | `/api/v1/coach/conversations` | 대화 생성 / 목록 |
| GET | `/api/v1/coach/conversations/{id}/messages` | 대화 내역 |
| POST | `/api/v1/coach/conversations/{id}/ask` | **AI 추천 (SSE: delta / done / error)** |

## 설계 메모

- **BMI 는 입력값이 아니라 파생값**입니다. `body_metrics.bmi` 를 generated column 으로 두어
  키·체중이 있으면 DB 가 계산하고, 차트는 다른 지표와 동일한 경로로 읽습니다.
- **변동폭 통계**(`first/last/min/max/delta`)는 `usecase.Summarize` 에서 계산합니다.
  DB 는 정렬된 포인트만 돌려주고, 통계 로직은 유닛 테스트 대상입니다(`metric_test.go`).
- **그룹 공유 권한**은 `group_members.share_data` 로 사용자가 통제하며,
  다른 사용자의 차트 조회는 `GroupRepository.SharesWith` 를 반드시 통과합니다.
- **지표 컬럼명은 화이트리스트 맵**(`metricColumns`)을 거쳐야만 SQL 에 들어갑니다.
- **소셜 로그인의 code→token 교환은 서버에서만** 수행합니다. client secret 은 앱 번들에 넣지 않습니다.
- **SSE 를 XHR 로 수신**합니다. React Native 는 `fetch` 의 ReadableStream 을 지원하지 않기 때문입니다.
- **Supabase 의 public 스키마 자동 노출을 막습니다.** 마이그레이션이 8개 테이블에 RLS 를
  켜고 정책을 0개로 두어, anon 키로는 어떤 행도 읽히지 않습니다(백엔드는 소유자 역할로 우회).

## 다음에 채울 것

- 운동 세션/종목 기록 테이블 (현재는 신체 지표만)
- `state` 파라미터 검증 등 OAuth CSRF 방어
- 유닛 테스트 확대: `usecase.Auth`(리포지토리 fake), `oauth.Resolver`(httptest), `transport` 핸들러
- rate limit, refresh token 만료 정리 배치, 구조화된 요청 ID 로깅
