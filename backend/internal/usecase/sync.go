package usecase

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha1"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"log/slog"
	"math"
	"strconv"
	"strings"
	"time"

	"github.com/devsixt/workout/backend/internal/domain"
	"github.com/google/uuid"
)

const (
	syncStaleAfter     = 10 * time.Minute // 화면을 열 때 자동 동기화하는 간격
	firstSyncLookback  = 90 * 24 * time.Hour
	resyncOverlap      = 3 * 24 * time.Hour // 늦게 올라온 활동 · 고친 활동도 다시 받는다
	stateTTL           = 10 * time.Minute
	maxIngestWorkouts  = 200
	maxIngestErrors    = 5
	maxDeviceConns     = 10
	deviceTokenPrefix  = "wkd_"
	tokenRefreshMargin = 2 * time.Minute
)

// Sync 는 기기 · 앱 연동을 다룬다.
//   - Strava(OAuth): 서버가 활동을 가져온다. Garmin · Samsung Health · Apple Watch 운동 앱 등이 Strava 로 올린다
//   - 기기 토큰: 폰 자동화(iOS 단축어 등)가 토큰을 붙여 운동 기록을 보낸다
type Sync struct {
	conns    domain.SyncConnectionRepository
	sessions domain.SessionRepository
	strava   domain.ActivityProvider // 설정하지 않았으면 nil
	stateKey []byte
	clock    *Clock
}

func NewSync(conns domain.SyncConnectionRepository, sessions domain.SessionRepository, strava domain.ActivityProvider, stateKey string, clock *Clock) *Sync {
	return &Sync{conns: conns, sessions: sessions, strava: strava, stateKey: []byte(stateKey), clock: clock}
}

// StravaEnabled 는 서버에 Strava 앱 키가 설정됐는지다.
func (s *Sync) StravaEnabled() bool { return s.strava != nil && len(s.stateKey) > 0 }

func (s *Sync) Connections(ctx context.Context, userID string) ([]domain.SyncConnection, error) {
	return s.conns.List(ctx, userID)
}

func (s *Sync) Disconnect(ctx context.Context, userID, id string) error {
	conn, err := s.conns.Find(ctx, userID, id)
	if err != nil {
		return err
	}
	if conn.Provider == domain.ProviderStrava && s.strava != nil && conn.AccessToken != "" {
		// 권한 회수는 실패해도 연결은 지운다 (사용자는 Strava 설정에서도 끊을 수 있다)
		if err := s.strava.Revoke(ctx, conn.AccessToken); err != nil {
			slog.Warn("strava revoke", "connection", conn.ID, "error", err)
		}
	}
	return s.conns.Delete(ctx, userID, id)
}

// ── Strava ─────────────────────────────────────────────

// StravaAuthURL 은 Strava 동의 화면 주소다. state 에 사용자 id 를 서명해 넣어, 돌아온 요청(로그인 토큰 없음)이 누구 것인지 안다.
func (s *Sync) StravaAuthURL(userID string) (string, error) {
	if !s.StravaEnabled() {
		return "", invalid("서버에 Strava 연동이 설정되지 않았습니다")
	}
	return s.strava.AuthURL(signState(s.stateKey, userID, s.clock.Now().Add(stateTTL))), nil
}

// StravaCallback 은 동의 뒤 돌아온 code 로 토큰을 받아 연결을 저장하고 첫 동기화를 한다.
func (s *Sync) StravaCallback(ctx context.Context, state, code string) error {
	if !s.StravaEnabled() {
		return invalid("서버에 Strava 연동이 설정되지 않았습니다")
	}
	userID, err := verifyState(s.stateKey, state, s.clock.Now())
	if err != nil {
		return err
	}
	if code == "" {
		return invalid("Strava 연결이 취소됐습니다")
	}
	token, err := s.strava.Exchange(ctx, code)
	if err != nil {
		return err
	}

	conn := &domain.SyncConnection{
		ID:                uuid.NewString(),
		UserID:            userID,
		Provider:          domain.ProviderStrava,
		Name:              strings.TrimSpace("Strava " + token.AccountName),
		ExternalAccountID: token.AccountID,
		AccessToken:       token.AccessToken,
		RefreshToken:      token.RefreshToken,
		TokenExpiresAt:    token.ExpiresAt,
	}
	if err := s.conns.SaveOAuth(ctx, conn); err != nil {
		return err
	}
	// 첫 동기화가 실패해도 연결은 남는다 (오류는 연결에 기록되고, 화면을 열 때 다시 시도한다)
	_, _ = s.pull(ctx, conn)
	return nil
}

// SyncAll 은 사용자의 Strava 연결을 동기화한다. force 가 아니면 마지막 동기화 뒤 10분이 지난 연결만 한다.
func (s *Sync) SyncAll(ctx context.Context, userID string, force bool) ([]domain.SyncConnection, error) {
	conns, err := s.conns.List(ctx, userID)
	if err != nil {
		return nil, err
	}
	now := s.clock.Now()
	synced := false
	for i := range conns {
		c := &conns[i]
		if c.Provider != domain.ProviderStrava || s.strava == nil {
			continue
		}
		if !force && c.LastSyncedAt != nil && now.Sub(*c.LastSyncedAt) < syncStaleAfter {
			continue
		}
		// 토큰이 필요하므로 목록 대신 연결 하나를 다시 읽는다
		full, err := s.conns.Find(ctx, userID, c.ID)
		if err != nil {
			return nil, err
		}
		_, _ = s.pull(ctx, full) // 오류는 연결에 남는다
		synced = true
	}
	if !synced {
		return conns, nil
	}
	return s.conns.List(ctx, userID)
}

// pull 은 자동 동기화다: 처음이면 최근 90일, 아니면 마지막 동기화 3일 전부터 가져온다.
func (s *Sync) pull(ctx context.Context, conn *domain.SyncConnection) (*ImportResult, error) {
	after := s.clock.Now().Add(-firstSyncLookback)
	if conn.LastSyncedAt != nil && conn.LastError == "" {
		after = conn.LastSyncedAt.Add(-resyncOverlap)
	}
	return s.pullRange(ctx, conn, after, time.Time{}, "", "")
}

// Import 는 Strava 연결에서 [from, to] 날짜의 활동을 가져온다. 둘 다 비우면 전체.
// 이미 있는 기록(같은 활동 · 다른 출처의 같은 운동)은 건너뛰고 고치지 않는다.
func (s *Sync) Import(ctx context.Context, userID, connID, from, to string) (*ImportResult, error) {
	conn, err := s.conns.Find(ctx, userID, connID)
	if err != nil {
		return nil, err
	}
	if conn.Provider != domain.ProviderStrava {
		return nil, invalid("기기 토큰 연결은 폰이 보내 주는 방식이라 서버에서 가져올 수 없습니다")
	}
	if s.strava == nil {
		return nil, invalid("서버에 Strava 연동이 설정되지 않았습니다")
	}

	after, before := time.Unix(0, 0), time.Time{}
	if from != "" || to != "" {
		if to == "" {
			to = from
		}
		if from == "" {
			from = to
		}
		start, err := parseDay(from, "시작")
		if err != nil {
			return nil, err
		}
		end, err := parseDay(to, "끝")
		if err != nil {
			return nil, err
		}
		if start.After(end) {
			return nil, invalid("시작 날짜가 끝 날짜보다 늦습니다")
		}
		from, to = formatDay(start), formatDay(end)
		// 활동 날짜는 활동한 곳의 현지 날짜라 하루씩 넉넉히 받고 날짜로 거른다
		after, before = start.AddDate(0, 0, -1), end.AddDate(0, 0, 2)
	}
	return s.pullRange(ctx, conn, after, before, from, to)
}

// pullRange 는 Strava 활동을 받아 기록에 넣고, 결과(오류 포함)를 연결에 남긴다. from/to 가 있으면 그 날짜만 넣는다.
func (s *Sync) pullRange(ctx context.Context, conn *domain.SyncConnection, after, before time.Time, from, to string) (*ImportResult, error) {
	now := s.clock.Now()
	result, err := s.fetchAndImport(ctx, conn, now, after, before, from, to)
	msg := ""
	if err != nil {
		slog.Warn("strava sync", "connection", conn.ID, "error", err)
		msg = "동기화에 실패했습니다. 잠시 뒤 다시 시도하세요."
		if errors.Is(err, domain.ErrUnauthorized) {
			msg = "Strava 권한이 만료됐습니다. 연결을 끊고 다시 연결하세요."
		}
	}
	if markErr := s.conns.MarkSynced(ctx, conn.ID, now, msg); markErr != nil {
		return result, markErr
	}
	if err != nil {
		if errors.Is(err, domain.ErrUnauthorized) {
			return result, invalid("%s", msg)
		}
		return result, err
	}
	return result, nil
}

func (s *Sync) fetchAndImport(ctx context.Context, conn *domain.SyncConnection, now, after, before time.Time, from, to string) (*ImportResult, error) {
	if now.Add(tokenRefreshMargin).After(conn.TokenExpiresAt) {
		token, err := s.strava.Refresh(ctx, conn.RefreshToken)
		if err != nil {
			return nil, err
		}
		if err := s.conns.UpdateTokens(ctx, conn.ID, token.AccessToken, token.RefreshToken, token.ExpiresAt); err != nil {
			return nil, err
		}
		conn.AccessToken, conn.RefreshToken, conn.TokenExpiresAt = token.AccessToken, token.RefreshToken, token.ExpiresAt
	}

	activities, err := s.strava.Activities(ctx, conn.AccessToken, after, before)
	if err != nil {
		return nil, err
	}
	if from != "" {
		inRange := activities[:0]
		for _, a := range activities {
			if a.PerformedOn >= from && a.PerformedOn <= to {
				inRange = append(inRange, a)
			}
		}
		activities = inRange
	}
	return s.importActivities(ctx, conn, domain.SourceStrava, activities)
}

func sessionFromActivity(act domain.ExternalActivity, today string) (*domain.Session, error) {
	session, err := NormalizeSession(SessionInput{
		PerformedOn:  act.PerformedOn,
		Kind:         act.Kind,
		Title:        act.Title,
		DistanceKm:   act.DistanceKm,
		DurationSec:  act.DurationSec,
		CaloriesKcal: act.CaloriesKcal,
		AvgHeartRate: act.AvgHeartRate,
	}, today)
	if err != nil {
		return nil, err
	}
	session.ID = uuid.NewString()
	session.ExternalID = act.ExternalID
	return session, nil
}

// ── 기기 토큰 ─────────────────────────────────────────────

// CreateDevice 는 기기 연결을 만들고 토큰 원문을 한 번만 돌려준다 (서버에는 해시만 남는다).
func (s *Sync) CreateDevice(ctx context.Context, userID, name string) (*domain.SyncConnection, string, error) {
	name, err := trimMax(name, 40, "기기 이름")
	if err != nil {
		return nil, "", err
	}
	if name == "" {
		name = "내 폰"
	}
	existing, err := s.conns.List(ctx, userID)
	if err != nil {
		return nil, "", err
	}
	devices := 0
	for _, c := range existing {
		if c.Provider == domain.ProviderDevice {
			devices++
		}
	}
	if devices >= maxDeviceConns {
		return nil, "", invalid("기기는 %d개까지 연결할 수 있습니다. 쓰지 않는 기기를 먼저 끊으세요", maxDeviceConns)
	}

	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		return nil, "", fmt.Errorf("create device token: %w", err)
	}
	token := deviceTokenPrefix + base64.RawURLEncoding.EncodeToString(raw)

	conn := &domain.SyncConnection{
		ID:       uuid.NewString(),
		UserID:   userID,
		Provider: domain.ProviderDevice,
		Name:     name,
	}
	if err := s.conns.CreateDevice(ctx, conn, hashToken(token)); err != nil {
		return nil, "", err
	}
	return conn, token, nil
}

// IngestWorkout 은 기기가 보낸 운동 하나다. 단축어 같은 자동화가 만들기 쉽게 여러 단위를 받는다.
type IngestWorkout struct {
	ID           string // 기기 쪽 고유 id. 없으면 날짜 · 종류 · 거리 · 시간으로 만든다 (같은 기록을 다시 보내도 한 번만 들어간다)
	Date         string // YYYY-MM-DD
	Start        string // 시작 시각 (RFC3339 등). Date 가 없으면 이것의 날짜
	Type         string // running · 러닝 · strength … (러닝 / 웨이트 / 기타로 나눈다)
	Title        string
	DistanceKm   *float64
	DistanceM    *float64
	DurationSec  *float64
	DurationMin  *float64
	CaloriesKcal *float64
	AvgHeartRate *float64
}

type IngestResult struct {
	Connection string `json:"connection"`
	ImportResult
}

// Ingest 는 기기 토큰으로 들어온 운동 기록을 저장한다. 이미 있는 기록은 건너뛴다.
func (s *Sync) Ingest(ctx context.Context, token string, workouts []IngestWorkout) (*IngestResult, error) {
	if !strings.HasPrefix(token, deviceTokenPrefix) {
		return nil, fmt.Errorf("ingest: not a device token: %w", domain.ErrUnauthorized)
	}
	conn, err := s.conns.FindByIngestHash(ctx, hashToken(token))
	if errors.Is(err, domain.ErrNotFound) {
		return nil, fmt.Errorf("ingest: unknown device token: %w", domain.ErrUnauthorized)
	}
	if err != nil {
		return nil, err
	}
	if len(workouts) == 0 {
		return nil, invalid("보낸 운동 기록이 없습니다 (workouts)")
	}
	if len(workouts) > maxIngestWorkouts {
		return nil, invalid("한 번에 %d개까지 보낼 수 있습니다", maxIngestWorkouts)
	}

	activities := make([]domain.ExternalActivity, 0, len(workouts))
	var rejected []string
	for i, w := range workouts {
		act, err := s.activityFromIngest(w)
		if err != nil {
			rejected = append(rejected, fmt.Sprintf("%d번째: %s", i+1, userText(err)))
			continue
		}
		activities = append(activities, act)
	}

	result, err := s.importActivities(ctx, conn, domain.SourceDevice, activities)
	if err != nil {
		return nil, err
	}
	result.Fetched = len(workouts)
	result.Skipped += len(rejected)
	result.Errors = append(rejected, result.Errors...)
	if len(result.Errors) > maxIngestErrors {
		result.Errors = result.Errors[:maxIngestErrors]
	}

	syncErr := ""
	if result.Saved == 0 && result.Duplicates == 0 {
		syncErr = "받은 기록을 하나도 저장하지 못했습니다"
	}
	if err := s.conns.MarkSynced(ctx, conn.ID, s.clock.Now(), syncErr); err != nil {
		return nil, err
	}
	return &IngestResult{Connection: conn.Name, ImportResult: *result}, nil
}

func (s *Sync) activityFromIngest(w IngestWorkout) (domain.ExternalActivity, error) {
	date, err := s.ingestDate(w)
	if err != nil {
		return domain.ExternalActivity{}, err
	}
	kind := KindFromType(w.Type)

	var distance *float64
	switch {
	case w.DistanceKm != nil:
		distance = w.DistanceKm
	case w.DistanceM != nil:
		km := *w.DistanceM / 1000
		distance = &km
	}
	if distance != nil {
		km := round2(*distance)
		distance = &km
	}
	var duration *int
	switch {
	case w.DurationSec != nil:
		duration = roundInt(*w.DurationSec)
	case w.DurationMin != nil:
		duration = roundInt(*w.DurationMin * 60)
	}
	var kcal, hr *int
	if w.CaloriesKcal != nil {
		kcal = roundInt(*w.CaloriesKcal)
	}
	if w.AvgHeartRate != nil {
		hr = roundInt(*w.AvgHeartRate)
	}

	externalID := strings.TrimSpace(w.ID)
	if len(externalID) > 200 {
		return domain.ExternalActivity{}, invalid("id 는 200자 이하로 보내세요")
	}
	if externalID == "" {
		externalID = derivedID(date, w.Start, kind, distance, duration)
	}

	return domain.ExternalActivity{
		ExternalID:   externalID,
		Title:        w.Title,
		Kind:         kind,
		PerformedOn:  date,
		DistanceKm:   distance,
		DurationSec:  duration,
		CaloriesKcal: kcal,
		AvgHeartRate: hr,
	}, nil
}

// ingestDate 는 date(YYYY-MM-DD) 를 먼저 보고, 없으면 start 시각의 날짜(시각에 붙은 시간대 기준)를 쓴다.
func (s *Sync) ingestDate(w IngestWorkout) (string, error) {
	if d := strings.TrimSpace(w.Date); d != "" {
		if len(d) >= 10 {
			if t, err := time.Parse(domain.DateLayout, d[:10]); err == nil {
				return formatDay(t), nil
			}
		}
		return "", invalid("date 형식이 올바르지 않습니다 (YYYY-MM-DD)")
	}
	start := strings.TrimSpace(w.Start)
	if start == "" {
		return "", invalid("date 나 start 중 하나는 보내세요")
	}
	if t, err := time.Parse(time.RFC3339, start); err == nil {
		return formatDay(t), nil
	}
	for _, layout := range []string{"2006-01-02T15:04:05", "2006-01-02 15:04:05", "2006-01-02 15:04"} {
		if t, err := time.ParseInLocation(layout, start, s.clock.Location()); err == nil {
			return formatDay(t), nil
		}
	}
	return "", invalid("start 형식이 올바르지 않습니다 (예: 2026-10-21T07:00:00+09:00)")
}

// KindFromType 은 기기 · 앱이 쓰는 운동 이름을 러닝 / 웨이트 / 기타로 나눈다.
func KindFromType(t string) domain.WorkoutKind {
	t = strings.ToLower(t)
	for _, word := range []string{"run", "jog", "러닝", "달리기", "조깅"} {
		if strings.Contains(t, word) {
			return domain.KindRun
		}
	}
	for _, word := range []string{"strength", "weight", "웨이트", "근력", "헬스"} {
		if strings.Contains(t, word) {
			return domain.KindWeight
		}
	}
	return domain.KindOther
}

func derivedID(date, start string, kind domain.WorkoutKind, distance *float64, duration *int) string {
	km, sec := 0.0, 0
	if distance != nil {
		km = *distance
	}
	if duration != nil {
		sec = *duration
	}
	sum := sha1.Sum(fmt.Appendf(nil, "%s|%s|%s|%.2f|%d", date, strings.TrimSpace(start), kind, km, sec))
	return "auto-" + hex.EncodeToString(sum[:])
}

func roundInt(v float64) *int {
	n := int(math.Round(v))
	return &n
}

func hashToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

// userText 는 ErrInvalidInput 으로 감싼 한국어 메시지에서 센티널 꼬리를 뗀다.
func userText(err error) string {
	return strings.TrimSuffix(err.Error(), ": "+domain.ErrInvalidInput.Error())
}

// ── OAuth state ─────────────────────────────────────────────

func signState(key []byte, userID string, expires time.Time) string {
	payload := userID + "." + strconv.FormatInt(expires.Unix(), 10)
	mac := hmac.New(sha256.New, key)
	mac.Write([]byte(payload))
	return base64.RawURLEncoding.EncodeToString([]byte(payload)) + "." + base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}

func verifyState(key []byte, state string, now time.Time) (string, error) {
	expired := invalid("연결 요청이 만료됐습니다. 다시 시도하세요")
	encoded, sig, ok := strings.Cut(state, ".")
	if !ok {
		return "", expired
	}
	payload, err := base64.RawURLEncoding.DecodeString(encoded)
	if err != nil {
		return "", expired
	}
	got, err := base64.RawURLEncoding.DecodeString(sig)
	if err != nil {
		return "", expired
	}
	mac := hmac.New(sha256.New, key)
	mac.Write(payload)
	if !hmac.Equal(got, mac.Sum(nil)) {
		return "", expired
	}
	userID, expiresAt, ok := strings.Cut(string(payload), ".")
	if !ok {
		return "", expired
	}
	unix, err := strconv.ParseInt(expiresAt, 10, 64)
	if err != nil || now.After(time.Unix(unix, 0)) {
		return "", expired
	}
	if _, err := uuid.Parse(userID); err != nil {
		return "", expired
	}
	return userID, nil
}
