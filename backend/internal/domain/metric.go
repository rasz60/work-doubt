package domain

import (
	"context"
	"time"
)

// MetricKind 는 변동폭 차트에서 뽑아낼 수 있는 지표 종류다.
type MetricKind string

const (
	MetricWeight         MetricKind = "weight_kg"
	MetricHeight         MetricKind = "height_cm"
	MetricSkeletalMuscle MetricKind = "skeletal_muscle_kg"
	MetricBodyFatPct     MetricKind = "body_fat_percentage"
	MetricBMI            MetricKind = "bmi"
)

func (k MetricKind) Valid() bool {
	switch k {
	case MetricWeight, MetricHeight, MetricSkeletalMuscle, MetricBodyFatPct, MetricBMI:
		return true
	default:
		return false
	}
}

// BodyMetric 은 사용자가 한 시점에 입력한 신체 지표 한 줄이다.
// BMI 는 DB 의 generated column 이므로 쓰기 시에는 무시된다.
type BodyMetric struct {
	ID               string    `json:"id"`
	UserID           string    `json:"user_id"`
	MeasuredAt       time.Time `json:"measured_at"`
	HeightCm         *float64  `json:"height_cm,omitempty"`
	WeightKg         *float64  `json:"weight_kg,omitempty"`
	SkeletalMuscleKg *float64  `json:"skeletal_muscle_kg,omitempty"`
	BodyFatPct       *float64  `json:"body_fat_percentage,omitempty"`
	BMI              *float64  `json:"bmi,omitempty"`
	Memo             string    `json:"memo,omitempty"`
	CreatedAt        time.Time `json:"created_at"`
}

// MetricPoint 는 차트의 한 점이다.
type MetricPoint struct {
	MeasuredAt time.Time `json:"measured_at"`
	Value      float64   `json:"value"`
}

// MetricSeries 는 차트 하나를 그리는 데 필요한 전부를 담는다.
type MetricSeries struct {
	Kind   MetricKind    `json:"kind"`
	Points []MetricPoint `json:"points"`
	Stats  SeriesStats   `json:"stats"`
}

// SeriesStats 가 "변동폭"이다. Delta = 마지막 - 처음.
type SeriesStats struct {
	First float64 `json:"first"`
	Last  float64 `json:"last"`
	Min   float64 `json:"min"`
	Max   float64 `json:"max"`
	Delta float64 `json:"delta"`
}

type MetricRange struct {
	From time.Time
	To   time.Time
}

type BodyMetricRepository interface {
	// Upsert 는 (user_id, measured_at) 기준으로 덮어쓴다.
	Upsert(ctx context.Context, m *BodyMetric) error
	Delete(ctx context.Context, userID, id string) error
	Latest(ctx context.Context, userID string) (*BodyMetric, error)
	List(ctx context.Context, userID string, r MetricRange, limit int) ([]BodyMetric, error)
	// Series 는 지표 1종만 정렬된 상태로 가져온다. NULL 값은 제외한다.
	Series(ctx context.Context, userID string, kind MetricKind, r MetricRange) ([]MetricPoint, error)
}
