# 배포 가이드 (ae:p Oracle 서버)

운동기록은 ae:p 포털과 **같은 서버·같은 도메인**에 올라갑니다. 예전 단독 서버(systemd·PowerShell 업로드)
방식은 쓰지 않습니다. 포털·업무일지와 같은 방식(Caddy + pm2 + GitHub Actions)입니다.

```
https://ae2p.duckdns.org/workout/*      → ~/work-doubt/app/dist          (Expo 웹)
https://ae2p.duckdns.org/api/workout/*  → 127.0.0.1:8091                 (pm2: workout-api)
```

## 1. Supabase (1회)

1. **SQL Editor** 에서 마이그레이션을 번호 순서대로 한 번씩 실행
   - [0001_workout_schema.sql](../backend/migrations/0001_workout_schema.sql) — 프로필 · 그룹 · 신체 지표 · AI 코치
   - [0002_activity.sql](../backend/migrations/0002_activity.sql) — 운동 계획 · 수행 기록 · 기기 연동 (**0002 를 실행하기 전에 새 백엔드를 배포하면 HOME · RECORD 가 오류를 낸다**)
   - `workout` 스키마만 만든다. 업무일지(`public`)는 건드리지 않는다
   - **Settings → API → Exposed schemas 에 `workout` 을 넣지 않는다** (브라우저 REST 노출 금지)
2. **Connect → Session pooler** 연결 문자열을 복사해 둔다 (DB 비밀번호를 모르면 Settings → Database 에서 재설정)

## 2. 서버 준비 (1회)

서버에서는 **빌드하지 않는다** (Go · Expo 빌드는 GitHub Actions). 서버(메모리 1GB)에서 Go 백엔드를 컴파일하면
Anthropic SDK 패키지 하나에서 컴파일러가 1.2~1.9GB, Expo 웹 빌드는 Node 가 약 1.1GB 를 써서 스왑으로 버티다 서버가 멈췄다 (2026-10-20).
그래서 서버에는 Go 를 설치하지 않아도 되고, node 는 pm2 용으로만 있으면 된다.

```bash
# 저장소 받기 (읽기 전용 Deploy key — ae2p 와 같은 방식, ssh 별칭 github-workout)
ssh-keygen -t ed25519 -C "oracle-workout" -f ~/.ssh/workout_deploy -N ""
cat >> ~/.ssh/config <<'EOF'
Host github-workout
  HostName github.com
  User git
  IdentityFile ~/.ssh/workout_deploy
  IdentitiesOnly yes
EOF
cat ~/.ssh/workout_deploy.pub   # → GitHub rasz60/work-doubt → Settings → Deploy keys (쓰기 권한 없이)
git clone github-workout:rasz60/work-doubt.git ~/work-doubt
```

## 3. 환경 변수

```bash
cd ~/work-doubt
cp .env.example .env          # PORT=8091, SUPABASE_URL, DATABASE_URL(풀러), ANTHROPIC_API_KEY
# app/.env 는 서버에 필요 없다 (웹은 Actions 가 저장소 Variables 로 빌드한다)
```

## 4. 첫 배포

6번(자동 배포)을 설정한 뒤 GitHub → Actions → deploy → **Run workflow**. 러너가 빌드한 묶음을 서버가 받아 바꿔 끼우고 pm2 를 띄운다.

```bash
curl -s http://127.0.0.1:8091/healthz    # {"status":"ok"}
```

## 5. Caddy

포털 저장소의 `deploy/Caddyfile` 에 운동기록 블록이 들어 있다. 포털 저장소를 받은 뒤:

```bash
sudo cp ~/ae2p/deploy/Caddyfile /etc/caddy/Caddyfile
sudo caddy validate --config /etc/caddy/Caddyfile && sudo systemctl reload caddy
```

## 6. 자동 배포 (GitHub Actions)

`main` 에 push → Go vet·test + 앱 타입체크 → **러너에서** Go 바이너리(linux amd64 · arm64)와 Expo 웹 빌드
→ 묶음(tar.gz)을 SSH 표준입력으로 서버에 보낸다 → 서버의 `scripts/deploy.sh` 가 받아서
코드를 빌드 커밋에 맞추고, 서버 아키텍처에 맞는 바이너리와 웹을 바꿔 끼우고, pm2 재시작 → `/healthz` 확인
(30초 안에 응답이 없으면 이전 바이너리 · 웹으로 되돌린다).

`deploy.sh` 안전장치: 전체 10분 제한(`DEPLOY_TIMEOUT`, 넘으면 띄운 프로세스까지 끝낸다) · 동시 배포 잠금(`/tmp/work-doubt-deploy.lock`).

```bash
# (서버) Actions 전용 키를 만들고, 이 키로는 운동기록 deploy.sh 만 실행되게 묶는다
ssh-keygen -t ed25519 -C "github-actions-workout" -f ~/.ssh/gha_workout -N ""
echo "command=\"bash $HOME/work-doubt/scripts/deploy.sh\",no-port-forwarding,no-X11-forwarding,no-agent-forwarding,no-pty $(cat ~/.ssh/gha_workout.pub)" >> ~/.ssh/authorized_keys
cat ~/.ssh/gha_workout           # → Secret DEPLOY_SSH_KEY (등록 후 서버의 이 파일은 지운다)
ssh-keyscan -t ed25519 localhost | sed 's/^localhost/ae2p.duckdns.org/'   # → Secret DEPLOY_KNOWN_HOSTS
```

GitHub `rasz60/work-doubt` → Settings → Secrets and variables → Actions 에
`DEPLOY_HOST`(ae2p.duckdns.org) · `DEPLOY_USER`(ubuntu) · `DEPLOY_SSH_KEY` · `DEPLOY_KNOWN_HOSTS`.
같은 화면의 **Variables** 탭에 웹 빌드용 공개 값 `EXPO_PUBLIC_SUPABASE_URL` · `EXPO_PUBLIC_SUPABASE_ANON_KEY` (포털과 같은 값).
서버의 `app/.env` 는 더 이상 빌드에 쓰이지 않는다.

## 7. 기기 연동 (선택)

**기기 토큰**(폰 자동화 → 서버)은 설정이 필요 없다. PROFILE › Devices 에서 토큰을 만들면 보낼 주소와 형식이 나온다.

**Strava**(서버가 10분마다 가져옴)는 Strava 앱 키가 있어야 켜진다.

1. https://www.strava.com/settings/api 에서 앱을 만든다. **Authorization Callback Domain** 에 `ae2p.duckdns.org`
2. 서버 `~/work-doubt/.env` 에 `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET` 를 넣고 `bash ~/work-doubt/scripts/deploy.sh` (pm2 만 다시 띄운다)
3. PROFILE › Devices › CONNECT STRAVA

돌아오는 주소는 `PUBLIC_URL`(기본 `https://ae2p.duckdns.org`) + `/api/workout/api/v1/sync/strava/callback` 이다.
새 Strava 앱은 처음에 연결할 수 있는 선수 수가 적다(본인 + 몇 명). 그룹 구성원까지 쓰려면 Strava 에 한도 상향을 신청한다.

## 운영

```bash
pm2 logs workout-api --lines 50 --nostream
bash ~/work-doubt/scripts/deploy.sh       # .env 를 바꾼 뒤 다시 띄우기 (빌드하지 않는다. 새 코드는 Actions → deploy → Run workflow)
```

예전 단독 서버와 예전 Supabase 프로젝트(`hsykrtillmitbhkyzruq`)는 이 배포가 확인되면 내려도 됩니다 (옮길 데이터 없음).
