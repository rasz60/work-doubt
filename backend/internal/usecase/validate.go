package usecase

import (
	"fmt"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/devsixt/workout/backend/internal/domain"
)

// invalid 는 화면에 그대로 보여 줄 한국어 메시지로 ErrInvalidInput 을 감싼다.
func invalid(format string, args ...any) error {
	return fmt.Errorf("%s: %w", fmt.Sprintf(format, args...), domain.ErrInvalidInput)
}

// parseDay 는 YYYY-MM-DD 를 UTC 자정으로 읽는다. 날짜끼리만 비교하므로 시간대는 붙이지 않는다.
func parseDay(value, field string) (time.Time, error) {
	t, err := time.Parse(domain.DateLayout, strings.TrimSpace(value))
	if err != nil {
		return time.Time{}, invalid("%s 날짜 형식이 올바르지 않습니다 (YYYY-MM-DD)", field)
	}
	return t, nil
}

func formatDay(t time.Time) string { return t.Format(domain.DateLayout) }

// isoWeekday 는 1=월 … 7=일.
func isoWeekday(t time.Time) int {
	if w := int(t.Weekday()); w != 0 {
		return w
	}
	return 7
}

func trimMax(value string, max int, field string) (string, error) {
	value = strings.TrimSpace(value)
	if utf8.RuneCountInString(value) > max {
		return "", invalid("%s은(는) %d자 이하로 입력하세요", field, max)
	}
	return value, nil
}

func checkFloat(v *float64, min, max float64, field string) error {
	if v == nil {
		return nil
	}
	if *v < min || *v > max {
		return invalid("%s은(는) %g~%g 사이로 입력하세요", field, min, max)
	}
	return nil
}

func checkInt(v *int, min, max int, field string) error {
	if v == nil {
		return nil
	}
	if *v < min || *v > max {
		return invalid("%s은(는) %d~%d 사이로 입력하세요", field, min, max)
	}
	return nil
}

// positive 는 0 이하 값을 "입력 안 함"으로 본다 (빈 칸을 0 으로 보내는 클라이언트 대비).
func positive[T int | float64](v *T) *T {
	if v == nil || *v <= 0 {
		return nil
	}
	return v
}
