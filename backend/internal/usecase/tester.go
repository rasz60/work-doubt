package usecase

import (
	"context"
	"fmt"

	"github.com/devsixt/workout/backend/internal/domain"
)

// Tester 는 공용 테스터 계정(P-0004)을 다룬다: 막은 기능 거절 · 로그아웃 때 정리.
// 테스터에게 막은 기능: AI 코치(대화 만들기 · 목록 · 메시지 · 묻기), 그룹 만들기 · 참여, Apple 건강 연동.
type Tester struct {
	repo domain.TesterRepository
}

func NewTester(repo domain.TesterRepository) *Tester {
	return &Tester{repo: repo}
}

// Guard 는 테스터면 ErrTesterBlocked 를 돌려준다. 막은 기능의 API 앞에서 부른다.
func (t *Tester) Guard(ctx context.Context, userID string) error {
	isTester, err := t.repo.IsTester(ctx, userID)
	if err != nil {
		return err
	}
	if isTester {
		return fmt.Errorf("tester guard: %w", domain.ErrTesterBlocked)
	}
	return nil
}

// Reset 은 테스터가 새로 만든 데이터를 지운다. 포털이 로그아웃 직전에 부른다.
// 테스터가 아니면 아무것도 지우지 않고 0 을 돌려준다.
func (t *Tester) Reset(ctx context.Context, userID string) (int, error) {
	isTester, err := t.repo.IsTester(ctx, userID)
	if err != nil || !isTester {
		return 0, err
	}
	return t.repo.Reset(ctx, userID)
}
