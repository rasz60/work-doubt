package usecase

import (
	"context"
	"fmt"
	"time"

	"github.com/devsixt/workout/backend/internal/domain"
	"github.com/google/uuid"
)

// 입력 검증 범위. 오타로 들어온 값이 차트를 망가뜨리지 않게 막는다.
var metricBounds = map[string][2]float64{
	"height_cm":          {50, 300},
	"weight_kg":          {10, 500},
	"skeletal_muscle_kg": {1, 150},
	"body_fat_pct":       {1, 80},
}

type Metric struct {
	metrics domain.BodyMetricRepository
	groups  domain.GroupRepository
}

func NewMetric(metrics domain.BodyMetricRepository, groups domain.GroupRepository) *Metric {
	return &Metric{metrics: metrics, groups: groups}
}

type RecordMetricInput struct {
	MeasuredAt       time.Time
	HeightCm         *float64
	WeightKg         *float64
	SkeletalMuscleKg *float64
	BodyFatPct       *float64
	Memo             string
}

// Record 는 측정값 한 건을 저장한다. 같은 날짜가 있으면 덮어쓴다.
func (m *Metric) Record(ctx context.Context, userID string, in RecordMetricInput) (*domain.BodyMetric, error) {
	if in.MeasuredAt.IsZero() {
		in.MeasuredAt = time.Now()
	}
	if in.MeasuredAt.After(time.Now().Add(24 * time.Hour)) {
		return nil, fmt.Errorf("record metric: measured_at is in the future: %w", domain.ErrInvalidInput)
	}
	if in.HeightCm == nil && in.WeightKg == nil && in.SkeletalMuscleKg == nil && in.BodyFatPct == nil {
		return nil, fmt.Errorf("record metric: at least one value is required: %w", domain.ErrInvalidInput)
	}

	for field, value := range map[string]*float64{
		"height_cm":          in.HeightCm,
		"weight_kg":          in.WeightKg,
		"skeletal_muscle_kg": in.SkeletalMuscleKg,
		"body_fat_pct":       in.BodyFatPct,
	} {
		if err := checkBounds(field, value); err != nil {
			return nil, err
		}
	}

	record := &domain.BodyMetric{
		ID:               uuid.NewString(),
		UserID:           userID,
		MeasuredAt:       in.MeasuredAt.UTC().Truncate(24 * time.Hour),
		HeightCm:         in.HeightCm,
		WeightKg:         in.WeightKg,
		SkeletalMuscleKg: in.SkeletalMuscleKg,
		BodyFatPct:       in.BodyFatPct,
		Memo:             in.Memo,
	}
	if err := m.metrics.Upsert(ctx, record); err != nil {
		return nil, err
	}
	return record, nil
}

func (m *Metric) Delete(ctx context.Context, userID, id string) error {
	return m.metrics.Delete(ctx, userID, id)
}

func (m *Metric) Latest(ctx context.Context, userID string) (*domain.BodyMetric, error) {
	return m.metrics.Latest(ctx, userID)
}

func (m *Metric) History(ctx context.Context, userID string, r domain.MetricRange, limit int) ([]domain.BodyMetric, error) {
	if limit <= 0 || limit > 1000 {
		limit = 365
	}
	return m.metrics.List(ctx, userID, normalizeRange(r), limit)
}

// Series 는 변동폭 차트 하나를 만든다. targetID 가 비어 있으면 본인 데이터다.
func (m *Metric) Series(ctx context.Context, viewerID, targetID string, kind domain.MetricKind, r domain.MetricRange) (*domain.MetricSeries, error) {
	if !kind.Valid() {
		return nil, fmt.Errorf("series: unknown metric kind %q: %w", kind, domain.ErrInvalidInput)
	}
	if targetID == "" {
		targetID = viewerID
	}
	if targetID != viewerID {
		shared, err := m.groups.SharesWith(ctx, viewerID, targetID)
		if err != nil {
			return nil, err
		}
		if !shared {
			return nil, fmt.Errorf("series: %s cannot read %s: %w", viewerID, targetID, domain.ErrForbidden)
		}
	}

	points, err := m.metrics.Series(ctx, targetID, kind, normalizeRange(r))
	if err != nil {
		return nil, err
	}
	return &domain.MetricSeries{Kind: kind, Points: points, Stats: Summarize(points)}, nil
}

// Summarize 는 포인트 목록에서 변동폭 통계를 계산한다.
// points 는 measured_at 오름차순이어야 한다.
func Summarize(points []domain.MetricPoint) domain.SeriesStats {
	if len(points) == 0 {
		return domain.SeriesStats{}
	}

	stats := domain.SeriesStats{
		First: points[0].Value,
		Last:  points[len(points)-1].Value,
		Min:   points[0].Value,
		Max:   points[0].Value,
	}
	for _, p := range points[1:] {
		if p.Value < stats.Min {
			stats.Min = p.Value
		}
		if p.Value > stats.Max {
			stats.Max = p.Value
		}
	}
	stats.Delta = stats.Last - stats.First
	return stats
}

func normalizeRange(r domain.MetricRange) domain.MetricRange {
	if r.To.IsZero() {
		r.To = time.Now().UTC()
	}
	if r.From.IsZero() {
		r.From = r.To.AddDate(0, -6, 0) // 기본 조회 구간: 최근 6개월
	}
	return r
}

func checkBounds(field string, value *float64) error {
	if value == nil {
		return nil
	}
	bounds, ok := metricBounds[field]
	if !ok {
		return nil
	}
	if *value < bounds[0] || *value > bounds[1] {
		return fmt.Errorf("record metric: %s=%.1f out of range [%.0f, %.0f]: %w",
			field, *value, bounds[0], bounds[1], domain.ErrInvalidInput)
	}
	return nil
}
