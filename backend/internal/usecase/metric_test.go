package usecase

import (
	"testing"
	"time"

	"github.com/devsixt/workout/backend/internal/domain"
)

func TestSummarize(t *testing.T) {
	day := func(n int) time.Time {
		return time.Date(2026, 1, n, 0, 0, 0, 0, time.UTC)
	}

	tests := []struct {
		name   string
		points []domain.MetricPoint
		want   domain.SeriesStats
	}{
		{
			name:   "empty",
			points: nil,
			want:   domain.SeriesStats{},
		},
		{
			name:   "single point has zero delta",
			points: []domain.MetricPoint{{MeasuredAt: day(1), Value: 72.5}},
			want:   domain.SeriesStats{First: 72.5, Last: 72.5, Min: 72.5, Max: 72.5, Delta: 0},
		},
		{
			name: "decreasing series keeps interim max",
			points: []domain.MetricPoint{
				{MeasuredAt: day(1), Value: 80},
				{MeasuredAt: day(2), Value: 83},
				{MeasuredAt: day(3), Value: 77},
			},
			want: domain.SeriesStats{First: 80, Last: 77, Min: 77, Max: 83, Delta: -3},
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := Summarize(tc.points)
			if got != tc.want {
				t.Errorf("Summarize() = %+v, want %+v", got, tc.want)
			}
		})
	}
}

func TestNormalizeRangeDefaultsToSixMonths(t *testing.T) {
	got := normalizeRange(domain.MetricRange{})

	if got.To.IsZero() || got.From.IsZero() {
		t.Fatalf("normalizeRange() left zero values: %+v", got)
	}
	if !got.From.Before(got.To) {
		t.Errorf("From %v should precede To %v", got.From, got.To)
	}
	if diff := got.To.Sub(got.From); diff < 150*24*time.Hour {
		t.Errorf("default window = %v, want roughly 6 months", diff)
	}
}
