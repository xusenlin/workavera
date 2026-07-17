package agent

import (
	"context"
	"errors"
	"testing"
)

func TestRequireApprovalUsesRunHandler(t *testing.T) {
	want := ApprovalRequest{ToolCallID: "call-1", ToolName: "board_delete_task"}
	ctx := withApprovalHandler(context.Background(), func(_ context.Context, request ApprovalRequest) (bool, error) {
		if request.ToolCallID != want.ToolCallID || request.ToolName != want.ToolName {
			t.Fatalf("unexpected approval request: %#v", request)
		}
		return true, nil
	})
	approved, err := RequireApproval(ctx, want)
	if err != nil || !approved {
		t.Fatalf("unexpected approval result: approved=%v err=%v", approved, err)
	}
}

func TestRequireApprovalFailsClosedWithoutHandler(t *testing.T) {
	approved, err := RequireApproval(context.Background(), ApprovalRequest{})
	if approved || !errors.Is(err, ErrApprovalUnavailable) {
		t.Fatalf("approval must fail closed: approved=%v err=%v", approved, err)
	}
}
