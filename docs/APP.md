# iPhone 앱 배포 가이드 (EAS)

웹(`/workout`)과 같은 코드로 iPhone 앱을 만든다. 앱에서만 되는 것은 **Apple 건강 연동**이다
(Apple Watch · 건강 앱에 남은 운동을 HealthKit 에서 읽어 `POST /api/v1/sync/apple-health` 로 보낸다).
빌드는 Expo 클라우드(EAS)가 하므로 Mac 이 없어도 Windows 에서 할 수 있다.

```
iPhone 앱 ── Supabase 로그인(이메일 · 비밀번호) ──► https://ae2p.duckdns.org/api/workout/*  (웹과 같은 백엔드)
          └─ HealthKit 운동 읽기 → /api/v1/sync/apple-health
```

## 1. 준비 (1회)

1. **Apple Developer Program** 가입 (연 $99, https://developer.apple.com/programs). HealthKit 은 무료 계정으로는 못 쓴다
2. **Expo 계정** 만들기 (https://expo.dev, 무료 플랜으로 충분 — iOS 빌드는 한 달 15회)
3. **Supabase 마이그레이션** `backend/migrations/0003_apple_health.sql` 을 SQL Editor 에서 실행
   (실행 전에는 Apple 건강 연결이 DB 제약 오류를 낸다)
4. 백엔드 배포 (`main` push → Actions). `/api/v1/sync/apple-health` 가 새로 생긴다

```powershell
cd app
npm i -g eas-cli
eas login
eas init                       # Expo 프로젝트를 만들고 app.json 에 extra.eas.projectId 를 넣는다 (커밋한다)
```

## 2. 환경 변수 (1회)

`EXPO_PUBLIC_API_BASE_URL` 은 `eas.json` 에 들어 있다. Supabase 값은 저장소에 두지 않고 EAS 에 넣는다 (웹 빌드의 GitHub Variables 와 같은 값):

```powershell
foreach ($e in 'development','preview','production') {
  eas env:create --environment $e --name EXPO_PUBLIC_SUPABASE_URL      --value https://xxxxxxxx.supabase.co --visibility plaintext
  eas env:create --environment $e --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value <anon 키>                 --visibility plaintext
}
```

## 3. 내 폰에 설치해서 써 보기 (preview)

```powershell
eas device:create              # 아이폰을 등록한다 (폰에서 QR 열기 → 프로필 설치)
eas build -p ios --profile preview
```

- 처음 빌드할 때 Apple 계정으로 로그인하면 인증서 · 프로비저닝 프로필 · **HealthKit capability** 를 EAS 가 알아서 만든다
- 빌드가 끝나면 나오는 QR 로 설치한다. iPhone **설정 › 개인정보 보호 및 보안 › 개발자 모드** 를 켜야 열린다
- 앱에서 로그인 → 내 정보 › 연결된 기기 › **Apple 건강 연결** → 권한 허용 → 최근 90일 운동을 가져온다
- 그 뒤로는 홈을 열 때 10분에 한 번 새 운동을 보낸다

등록한 기기에서만 열린다. 그룹 구성원에게 주려면 그 사람 폰도 `eas device:create` 로 등록하고 다시 빌드하거나, 4번 TestFlight 를 쓴다.

## 4. TestFlight · App Store (production)

```powershell
eas build -p ios --profile production --auto-submit
```

- App Store Connect 에 앱이 없으면 제출 단계에서 만든다. 빌드 번호는 EAS 가 올린다 (`appVersionSource: remote`)
- 올라간 빌드는 **TestFlight** 에서 구성원을 초대해 설치하게 할 수 있다 (내부 테스터는 심사 없이 바로)
- App Store 공개 심사에는 개인정보 처리방침 URL, 심사용 테스트 계정(ae:p 초대 계정)이 필요하다
- 화면 · 기능을 고치면 다시 빌드해야 한다. 앱 버전(`app.json` 의 `version`)은 사용자에게 보이는 값이라 필요할 때 손으로 올린다

## 5. 개발 (dev client)

HealthKit 은 Expo Go 에서 돌지 않는다. 개발용 빌드를 폰에 한 번 설치하고 그 위에서 코드를 고친다:

```powershell
eas build -p ios --profile development     # 한 번만 (네이티브 패키지를 더하거나 app.json 을 바꾸면 다시)
npx expo start                             # 폰의 개발용 앱에서 QR 을 연다. 웹은 w
```

로컬 백엔드를 폰에서 쓰려면 `app/.env` 의 `EXPO_PUBLIC_API_BASE_URL` 을 PC 의 LAN 주소(`http://192.168.x.x:8080`)로 바꾼다.

## 메모

- **Strava 연결**은 앱에서도 되지만 동의 뒤 웹(내 정보)으로 돌아간다. Apple Watch 만 쓰면 Apple 건강으로 충분하다
- **읽기 권한 거절**은 iOS 가 앱에 알려 주지 않는다. 운동이 0개로 보이면 건강 앱 › 프로필 › 앱 › Workout 에서 운동 읽기를 켠다
- 연결을 끊어도 받은 기록은 남고, HealthKit 권한은 설정 › 건강 › 데이터 접근 및 기기에서 끈다
- Android 앱도 같은 명령(`-p android`)으로 빌드되지만 건강 연동(Health Connect)은 아직 없다
