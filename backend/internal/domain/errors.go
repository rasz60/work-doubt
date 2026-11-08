package domain

import "errors"

// 유스케이스 계층이 반환하는 센티널 에러. transport 계층에서 HTTP 상태로 매핑한다.
var (
	ErrNotFound     = errors.New("resource not found")
	ErrConflict     = errors.New("resource already exists")
	ErrInvalidInput = errors.New("invalid input")
	ErrUnauthorized = errors.New("unauthorized")
	ErrForbidden    = errors.New("forbidden")
)

// 공용 테스터 계정(P-0004) 에러. 둘 다 403 이고, 화면에는 정해진 문장을 보여 준다.
var (
	// ErrTesterLocked 는 테스터가 기본 데이터(관리자가 잠근 데이터)를 바꾸려 한 것이다. DB 트리거 오류 AE401.
	ErrTesterLocked = errors.New("tester baseline data is locked")
	// ErrTesterBlocked 는 테스터 계정에 막은 기능이다 (AI 코치 · 그룹 · Apple 건강 연동). DB 트리거 오류 AE402.
	ErrTesterBlocked = errors.New("feature blocked for tester")
)
