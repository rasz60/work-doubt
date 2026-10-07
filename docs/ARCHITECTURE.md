# 설계 개요 — 운동 기록 앱 골격

이 문서는 현재 저장된 골격이 "왜 이렇게 생겼는지"를 설명합니다.
실행 방법은 [RUN.md](RUN.md) 를 보세요.

- 작성 기준일: 2026-10-06
- 상태: 골격(skeleton). 빌드·타입체크·유닛테스트 통과. 운동 세션 기록 기능은 미구현.

---

## 1. 기술 선택과 근거

요구사항은 **Web / iOS / Android 전체 지원**, 계정·소셜 로그인, 지표 변동폭 차트,
대화형 AI 추천입니다. 이 네 가지가 스택 선택을 사실상 결정했습니다.

| 레이어 | 선택 | 근거 | 탈락한 대안 |
|---|---|---|---|
| Frontend | **Expo (React Native + React Native Web) + TypeScript** | 3개 플랫폼을 단일 React 코드베이스로. 웹은 RN Web 으로 같은 소스를 렌더 | Flutter(언어 분리), PWA 단독(네이티브 스토어 배포 불가), RN + 별도 웹앱(화면 2중 구현) |
| Routing | **expo-router** | 파일 기반 라우팅 + 딥링크. 소셜 로그인 리디렉트(`workout://auth/callback/...`)가 라우팅과 같은 레이어에서 처리됨 | React Navigation 단독(딥링크 수동 구성) |
| Chart | **react-native-svg 직접 구현** | 차트 라이브러리는 웹/네이티브 렌더링 편차와 제스처 차이가 큼. 필요한 건 "단일 시리즈 추세선" 하나뿐이라 직접 그리는 쪽이 코드·의존성 모두 작음 | victory-native(네이티브 전용 가속 경로), recharts(웹 전용) |
| Backend | **Go 1.26 + 표준 `net/http`** | Go 1.22 이후 `ServeMux` 가 메서드·경로 변수 패턴을 지원해 웹 프레임워크가 불필요. SSE 스트리밍에 `http.Flusher` 로 충분. 단일 바이너리 배포 | Gin/Echo(의존성 추가 이득 없음), Node/NestJS(프론트와 언어 통일은 되지만 CPU·메모리 비용 큼) |
| DB | **Supabase (관리형 PostgreSQL) + pgx/v5 (raw SQL)** | 지표는 `(user_id, 날짜)` 시계열 범위 조회, 그룹 공유는 자기조인. 둘 다 인덱스를 직접 통제해야 해서 ORM 을 두지 않음. generated column 으로 BMI 파생. Supabase 는 **순수 Postgres 로만** 사용(4-3 참고) | MongoDB(그룹 조인·제약 불리), GORM(쿼리 플랜 불투명), Supabase Auth(네이버 미지원) |
| Auth | **JWT access + opaque refresh (rotation)** | 모바일·웹 공용. access 는 무상태 검증, refresh 는 DB 에 sha256 해시만 저장하고 사용 시 교체 | 세션 쿠키(모바일에서 취급 번거로움), JWT refresh(폐기 불가) |
| AI | **Anthropic Go SDK, `claude-opus-5`** | 지표를 프롬프트에 주입한 대화형 추천. adaptive thinking + 고정 프롬프트 캐싱 | 규칙 기반 추천(대화형 요구 미충족) |

---

## 2. 레이어 규칙 (Clean Architecture)

```
transport/http  ──▶  usecase  ──▶  domain  ◀──  repository/postgres
                                     ▲
                                     └──  platform/{auth,oauth,ai}
```

- 의존 방향은 **항상 안쪽(domain)으로만** 향합니다.
- `internal/domain` 은 **외부 패키지를 import 하지 않습니다**(표준 `context`, `time`, `errors` 만).
  엔티티와 리포지토리 **인터페이스**가 여기에 있고, 구현은 바깥 레이어가 가집니다.
- `usecase` 는 인터페이스에만 의존합니다. 그래서 DB 없이 fake 로 테스트할 수 있습니다.
- 에러는 `domain` 의 센티널 5종(`ErrNotFound` / `ErrConflict` / `ErrInvalidInput` /
  `ErrUnauthorized` / `ErrForbidden`)으로 모아 `%w` 로 감싸고,
  HTTP 상태 매핑은 `transport/http/response.go` 한 곳에서만 합니다.

### AI 공급자도 포트로 분리

`domain.CoachEngine` 인터페이스(`Stream(ctx, CoachContext, history, onDelta)`)만 `usecase` 가 압니다.
Anthropic SDK 는 `platform/ai/claude.go` 에만 들어 있어, 공급자 교체나 테스트 더블 주입이 한 파일로 끝납니다.

---

## 3. 디렉터리와 파일별 역할

```
workout/
├─ README.md                      프로젝트 진입점
├─ docs/ARCHITECTURE.md           이 문서
├─ docs/RUN.md                    실행 가이드
├─ docker-compose.yml             (선택) 오프라인 작업용 로컬 PostgreSQL
├─ scripts/load-env.ps1           .env → 셸 환경변수 로더
├─ .env.example                   환경변수 템플릿
│
├─ backend/                       Go API
│  ├─ cmd/api/main.go             진입점 · 의존성 조립 · graceful shutdown
│  ├─ internal/
│  │  ├─ config/config.go         환경변수 로딩 + 필수값 검증(JWT_SECRET 32B 이상)
│  │  ├─ domain/
│  │  │  ├─ errors.go             센티널 에러 5종
│  │  │  ├─ user.go               User · Identity · RefreshToken + 리포지토리 IF
│  │  │  ├─ group.go              Group · GroupMember(share_data) + 리포지토리 IF
│  │  │  ├─ metric.go             BodyMetric · MetricSeries · SeriesStats + 리포지토리 IF
│  │  │  └─ coach.go              Conversation · ChatMessage · CoachEngine 포트
│  │  ├─ usecase/
│  │  │  ├─ auth.go               가입/로그인/소셜/refresh rotation/프로필
│  │  │  ├─ metric.go             입력 범위 검증 · 변동폭 통계(Summarize) · 공유 권한 확인
│  │  │  ├─ group.go              그룹 생성 · 초대 코드 · 참여 · 멤버 조회
│  │  │  ├─ coach.go              질문 저장 → 컨텍스트 조립 → 스트리밍 → 답변 저장
│  │  │  └─ metric_test.go        Summarize / normalizeRange 유닛 테스트
│  │  ├─ repository/postgres/     raw SQL 구현 5개 + 에러 변환(translate)
│  │  ├─ platform/
│  │  │  ├─ auth/jwt.go           HS256 발급·검증, refresh 난수 생성, sha256 해시
│  │  │  ├─ oauth/oauth.go        구글/카카오/네이버 code→token→profile 정규화
│  │  │  └─ ai/claude.go          Claude 스트리밍 + 지표 프롬프트 직렬화
│  │  └─ transport/http/
│  │     ├─ server.go             라우팅 테이블 (Go 1.22 ServeMux 패턴)
│  │     ├─ middleware.go         Bearer 인증 · CORS · 요청 로깅
│  │     ├─ response.go           JSON 응답 · 도메인 에러 → 상태코드
│  │     └─ *_handler.go          auth / metric / group / coach 핸들러
│  └─ migrations/0001_init.sql    초기 스키마 7개 테이블
│
└─ app/                           Expo 클라이언트
   ├─ app.json                    번들 ID · scheme(workout) · plugins
   ├─ app/                        expo-router 화면
   │  ├─ _layout.tsx              AuthProvider + Stack + 테마
   │  ├─ index.tsx                세션 유무로 로그인/탭 분기
   │  ├─ login.tsx                이메일 로그인·가입 + 소셜 3사
   │  └─ (tabs)/
   │     ├─ _layout.tsx           인증 가드 + 탭 4개
   │     ├─ index.tsx             변동폭 대시보드(차트 4개)
   │     ├─ record.tsx            지표 입력
   │     ├─ coach.tsx             AI 코치 대화(SSE)
   │     └─ profile.tsx           프로필 + 그룹 관리
   └─ src/
      ├─ api/client.ts            fetch 래퍼 · 401 시 refresh 1회 재시도
      ├─ api/endpoints.ts         엔드포인트별 타입 지정 함수
      ├─ api/coachStream.ts       XHR 기반 SSE 수신
      ├─ api/storage.ts           토큰 저장소(네이티브 SecureStore / 웹 localStorage)
      ├─ components/TrendChart.tsx 단일 시리즈 추세 차트
      ├─ components/ui.tsx        Field · Button · Screen · Message
      ├─ hooks/useAuth.tsx        세션 컨텍스트
      ├─ theme.ts                 라이트/다크 팔레트(대비 검증 완료)
      └─ types.ts                 서버 JSON 스키마와 1:1 타입
```

---

## 4. 데이터 모델

```
users ─┬─< user_identities      (provider, provider_user_id) UNIQUE
       ├─< refresh_tokens       token_hash UNIQUE, 부분 인덱스(revoked_at IS NULL)
       ├─< body_metrics         (user_id, measured_at) UNIQUE  ← 일자별 upsert
       ├─< group_members >─ groups
       └─< coach_conversations ─< coach_messages
```

명명은 전부 `snake_case`, 시각은 `timestamptz`, 측정일만 `date` 입니다.

### 인덱스는 쿼리에서 역산했습니다

| 인덱스 | 이 쿼리를 위해 |
|---|---|
| `uq_user_identities_provider (provider, provider_user_id)` | 소셜 로그인 조회. UNIQUE 제약이 인덱스를 겸함 |
| `idx_refresh_tokens_user_active (user_id) WHERE revoked_at IS NULL` | 로그아웃 시 사용자별 전체 폐기. 살아 있는 토큰만 담아 작게 유지 |
| `idx_group_members_user_id (user_id, group_id)` | "내가 속한 그룹" + 공유 권한 자기조인(`SharesWith`) |
| `uq_body_metrics_user_day (user_id, measured_at)` | 일자별 upsert 충돌 대상 + 오름차순 범위 스캔(차트) |
| `idx_body_metrics_user_measured_at_desc (user_id, measured_at DESC)` | 최신 1건 조회(`Latest`). 위 UNIQUE 가 ASC 라 DESC 를 따로 둠 |
| `idx_coach_conversations_user_updated_at (user_id, updated_at DESC)` | 최근 대화 목록 |
| `idx_coach_messages_conversation_created_at (conversation_id, created_at)` | 대화 내역 시간순 |

### BMI 는 컬럼이 아니라 파생값

`body_metrics.bmi` 는 `GENERATED ALWAYS AS ... STORED` 입니다.
키·체중이 모두 있으면 DB 가 계산해 저장하고, 없으면 `NULL` 입니다.

- 클라이언트가 계산해 보내지 않으므로 **값이 어긋날 수 없습니다**.
- 차트는 BMI 를 다른 지표와 **완전히 동일한 경로**(`/metrics/series?kind=bmi`)로 읽습니다.
- `INSERT` 대상이 아니므로 리포지토리의 upsert 문에서 제외되어 있습니다.

### 4-3. Supabase 를 쓰는 방식 — "관리형 Postgres" 로만

프로젝트: `hsykrtillmitbhkyzruq`. Supabase 의 여러 기능 중 **Postgres 만** 씁니다.

| Supabase 기능 | 사용 | 이유 |
|---|---|---|
| Postgres | **사용** | 관리형 백업·모니터링을 공짜로 얻음. 스키마는 그대로 이식 가능 |
| Auth | 미사용 | **네이버 공급자를 지원하지 않음.** 구글·카카오만 쓰면 되지만 요구사항이 3사라, 인증을 둘로 쪼개지 않고 백엔드에 일원화 |
| PostgREST (자동 REST) | 미사용 | 권한을 RLS 정책으로 표현해야 해서 그룹 공유 규칙이 SQL 정책에 흩어짐. 유스케이스 계층에 두는 쪽이 테스트가 쉬움 |
| Realtime / Storage / Edge Functions | 미사용 | 현재 요구사항에 없음 |

이 선택의 대가로 **보안 조치 하나가 필수**가 됩니다.

> Supabase 는 `public` 스키마 테이블을 PostgREST 로 자동 노출하고, 기본 권한 때문에
> 새 테이블이 `anon` / `authenticated` 역할에 열립니다. 방치하면 **anon 키만으로
> 전 회원의 신체 지표를 읽을 수 있습니다.**

그래서 마이그레이션 끝부분에서 8개 테이블 전부에 **RLS 를 켜고 정책을 0개로 두어**
(= 모두 거부) `anon` / `authenticated` 의 테이블·시퀀스 권한을 회수합니다.
Go 백엔드는 테이블 소유자인 `postgres` 역할로 접속해 RLS 를 우회하므로 영향이 없습니다.
`FORCE ROW LEVEL SECURITY` 는 **쓰지 않습니다** — 소유자까지 정책 검사 대상이 되어
백엔드가 0행만 보게 될 수 있습니다.

### 4-4. 연결 경로: 직접 연결이 아니라 풀러

| 경로 | 호스트 | 주소 체계 | pgx 설정 |
|---|---|---|---|
| Direct | `db.<ref>.supabase.co:5432` | **IPv6 전용** | — (IPv4 환경에서 연결 불가) |
| Session pooler | `aws-0-<region>.pooler.supabase.com:5432` | IPv4 | 기본값(`cache_statement`) |
| Transaction pooler | 같은 호스트 `:6543` | IPv4 | `exec` (prepared statement 캐시 금지) |

`db.hsykrtillmitbhkyzruq.supabase.co` 는 AAAA 레코드만 있고 A 레코드가 없습니다.
IPv4 전용 네트워크에서는 **Supavisor 풀러가 유일한 경로**입니다.

이 차이가 코드에 반영되어 있습니다.

- `config.Load` 는 `DATABASE_URL` 이 직접 연결 호스트를 가리키면 기동 시 경고를 남깁니다.
- `postgres.Connect` 는 포트가 `6543` 이면 `QueryExecModeExec` 로 전환하고
  statement / description 캐시를 끕니다. transaction 풀러는 커넥션이 트랜잭션마다
  다른 백엔드로 갈 수 있어 named prepared statement 가 유지되지 않습니다.
- `DB_QUERY_MODE` (`cache_statement` / `exec` / `simple`) 로 강제할 수 있고,
  `DB_MAX_CONNS` 는 무료 플랜 연결 한도를 고려해 기본 5 입니다.

---

## 5. API

| Method | Path | 설명 |
|---|---|---|
| GET | `/healthz` | 헬스체크 |
| POST | `/api/v1/auth/register` | 이메일 가입 |
| POST | `/api/v1/auth/login` | 이메일 로그인 |
| POST | `/api/v1/auth/social/{provider}` | `google` / `kakao` / `naver` code 교환 |
| POST | `/api/v1/auth/refresh` | refresh token 교체(rotation) |
| POST | `/api/v1/auth/logout` | 해당 사용자 refresh token 전체 폐기 |
| GET · PATCH | `/api/v1/me` | 프로필 조회 · 수정 |
| POST · GET | `/api/v1/metrics` | 지표 입력(일자별 upsert) · 목록 |
| GET | `/api/v1/metrics/latest` | 최신 지표 1건 |
| GET | `/api/v1/metrics/series?kind=&from=&to=&user_id=` | **변동폭 차트 데이터** |
| DELETE | `/api/v1/metrics/{id}` | 지표 삭제 |
| POST · GET | `/api/v1/groups` | 그룹 생성 · 내 그룹 목록 |
| POST | `/api/v1/groups/join` | 초대 코드로 참여 |
| GET | `/api/v1/groups/{id}/members` | 구성원 목록 |
| DELETE | `/api/v1/groups/{id}/members/me` | 그룹 탈퇴 |
| POST · GET | `/api/v1/coach/conversations` | 대화 생성 · 목록 |
| GET | `/api/v1/coach/conversations/{id}/messages` | 대화 내역 |
| POST | `/api/v1/coach/conversations/{id}/ask` | **AI 추천 (SSE)** |

### 인증 흐름

```
① 로그인/가입  →  { user, tokens: { access_token, refresh_token, expires_at } }
② 일반 요청    →  Authorization: Bearer <access_token>
③ 401 수신     →  POST /auth/refresh { refresh_token }  (클라이언트가 1회만 자동 재시도)
④ 교체         →  서버가 기존 refresh 를 revoke 하고 새 쌍 발급
⑤ 로그아웃     →  사용자의 모든 refresh 폐기
```

access token 은 기본 30분, refresh 는 30일(`.env` 로 조정).
refresh 는 평문을 저장하지 않고 **sha256 해시만** 저장합니다.

### AI 추천 흐름 (SSE)

```
클라이언트 POST .../ask { question }
  │
  ├─ usecase: 질문을 coach_messages 에 저장
  ├─ usecase: 프로필 + 최신 지표 + 최근 3개월 추세 4종을 CoachContext 로 조립
  ├─ platform/ai: system(고정, 캐시) + 컨텍스트 + 최근 20개 메시지로 Claude 스트리밍
  │     └─ 델타마다 → event: delta  { "text": "..." }
  ├─ 전체 답변을 coach_messages 에 저장
  └─ event: done  { 저장된 메시지 }      실패 시 event: error
```

---

## 6. 설계 결정 메모

1. **SSE 를 XHR 로 받습니다** (`app/src/api/coachStream.ts`).
   React Native 는 `fetch` 의 `ReadableStream` 을 지원하지 않습니다.
   `XMLHttpRequest` 의 `onprogress` + `responseText` 증분 파싱은 웹·iOS·Android 모두에서 동작합니다.
2. **지표 컬럼명은 화이트리스트 맵을 통과해야만 SQL 에 들어갑니다**
   (`repository/postgres/body_metric_repository.go` 의 `metricColumns`).
   `?kind=` 쿼리 값이 컬럼명이 되는 구조라 이 맵이 유일한 방어선입니다.
3. **소셜 로그인의 code→token 교환은 서버에서만** 합니다.
   client secret 이 앱 번들에 포함되지 않습니다. 클라이언트는 authorization code 만 서버에 넘깁니다.
4. **데이터 공유는 사용자가 통제합니다.** `group_members.share_data` 가 `false` 면
   같은 그룹이어도 지표가 노출되지 않고, 타인 차트 조회는 `GroupRepository.SharesWith` 를 반드시 통과합니다.
5. **변동폭 통계는 애플리케이션에서 계산합니다.** DB 는 정렬된 포인트만 돌려주고,
   `first/last/min/max/delta` 는 `usecase.Summarize` 가 계산합니다. 순수 함수라 테스트 대상입니다.
6. **차트는 이중 축을 쓰지 않습니다.** 지표마다 축이 하나인 차트를 따로 쌓습니다.
   단일 시리즈이므로 범례 대신 제목이 식별자 역할을 하고, 숫자는 처음·마지막·선택 지점만 직접 표시합니다.
   라이트/다크 강조색은 각 배경에 대해 대비를 따로 검증했습니다.
7. **쓰기 타임아웃을 두지 않습니다.** SSE 응답이 길어질 수 있어 `http.Server.WriteTimeout` 은
   비워 두고 `ReadHeaderTimeout` 과 `IdleTimeout` 만 설정했습니다.

---

## 7. 현재 검증 상태

```
backend   go build ./...   OK
          go vet ./...     OK
          go test ./...    ok  (internal/usecase)
app       npm install            OK
          npx expo install --check  Dependencies are up to date
          npx tsc --noEmit       OK (에러 0)
```

유닛 테스트는 `usecase.Summarize`(빈 시리즈 / 단일 포인트 / 중간 최대값 보존)와
`normalizeRange`(기본 6개월 구간)만 들어 있습니다.

**아직 확인되지 않은 것**: Supabase 실제 연결과 마이그레이션 적용.
DB 비밀번호가 필요하고, 마이그레이션은 SQL Editor 에서 실행해야 합니다([RUN.md](RUN.md) 2장).
DNS 수준에서 직접 연결 호스트가 IPv6 전용임은 확인했습니다.

---

## 8. 미구현 — 다음에 채울 것

| 항목 | 메모 |
|---|---|
| 운동 세션 / 종목 기록 | 현재는 신체 지표만. `workout_sessions` + `workout_sets` 테이블과 유스케이스 필요 |
| OAuth `state` 검증 | 지금은 `state` 를 보내지만 검증하지 않음 (CSRF) |
| 테스트 확대 | `usecase.Auth`(fake 리포지토리), `oauth.Resolver`(httptest), 핸들러 상태코드 매핑, SSE 프레임 포맷 |
| 운영 | rate limit, 만료 refresh 정리 배치, 요청 ID 로깅, 마이그레이션 도구(golang-migrate 등) |
| 차트 | 기간 선택 필터, 표 보기(접근성), 그룹 멤버 비교 보기 |
