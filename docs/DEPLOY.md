# 배포 가이드 (ae:p Oracle 서버)

운동기록은 ae:p 포털과 **같은 서버·같은 도메인**에 올라갑니다. 예전 단독 서버(systemd·PowerShell 업로드)
방식은 쓰지 않습니다. 포털·업무일지와 같은 방식(Caddy + pm2 + GitHub Actions)입니다.

```
https://ae2p.duckdns.org/workout/*      → ~/work-doubt/app/dist          (Expo 웹)
https://ae2p.duckdns.org/api/workout/*  → 127.0.0.1:8091                 (pm2: workout-api)
```

## 1. Supabase (1회)

1. **SQL Editor** 에서 [backend/migrations/0001_workout_schema.sql](../backend/migrations/0001_workout_schema.sql) 실행
   - `workout` 스키마만 만든다. 업무일지(`public`)는 건드리지 않는다
   - **Settings → API → Exposed schemas 에 `workout` 을 넣지 않는다** (브라우저 REST 노출 금지)
2. **Connect → Session pooler** 연결 문자열을 복사해 둔다 (DB 비밀번호를 모르면 Settings → Database 에서 재설정)

## 2. 서버 준비 (1회)

```bash
# Go 설치 (ARM 서버)
GO_VER=1.26.2
curl -fsSL https://go.dev/dl/go${GO_VER}.linux-arm64.tar.gz -o /tmp/go.tgz
sudo rm -rf /usr/local/go && sudo tar -C /usr/local -xzf /tmp/go.tgz
/usr/local/go/bin/go version

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
cp app/.env.example app/.env  # EXPO_PUBLIC_SUPABASE_URL / _ANON_KEY (포털과 같은 값), EXPO_PUBLIC_API_BASE_URL 은 비움
```

## 4. 첫 배포

```bash
bash scripts/deploy.sh        # Go 빌드 → Expo 웹 빌드 → pm2 시작
curl -s http://127.0.0.1:8091/healthz    # {"status":"ok"}
```

## 5. Caddy

포털 저장소의 `deploy/Caddyfile` 에 운동기록 블록이 들어 있다. 포털 저장소를 받은 뒤:

```bash
sudo cp ~/ae2p/deploy/Caddyfile /etc/caddy/Caddyfile
sudo caddy validate --config /etc/caddy/Caddyfile && sudo systemctl reload caddy
```

## 6. 자동 배포 (GitHub Actions)

`main` 에 push → Go vet·test + 앱 타입체크 → 서버에 SSH 로 접속해 `scripts/deploy.sh` 실행.

```bash
# (서버) Actions 전용 키를 만들고, 이 키로는 운동기록 deploy.sh 만 실행되게 묶는다
ssh-keygen -t ed25519 -C "github-actions-workout" -f ~/.ssh/gha_workout -N ""
echo "command=\"bash $HOME/work-doubt/scripts/deploy.sh\",no-port-forwarding,no-X11-forwarding,no-agent-forwarding,no-pty $(cat ~/.ssh/gha_workout.pub)" >> ~/.ssh/authorized_keys
cat ~/.ssh/gha_workout           # → Secret DEPLOY_SSH_KEY (등록 후 서버의 이 파일은 지운다)
ssh-keyscan -t ed25519 localhost | sed 's/^localhost/ae2p.duckdns.org/'   # → Secret DEPLOY_KNOWN_HOSTS
```

GitHub `rasz60/work-doubt` → Settings → Secrets and variables → Actions 에
`DEPLOY_HOST`(ae2p.duckdns.org) · `DEPLOY_USER`(ubuntu) · `DEPLOY_SSH_KEY` · `DEPLOY_KNOWN_HOSTS`.

## 운영

```bash
pm2 logs workout-api --lines 50 --nostream
bash ~/work-doubt/scripts/deploy.sh       # 수동 배포 (.env 를 바꾼 뒤에도 이걸로 다시 띄운다)
```

예전 단독 서버와 예전 Supabase 프로젝트(`hsykrtillmitbhkyzruq`)는 이 배포가 확인되면 내려도 됩니다 (옮길 데이터 없음).
