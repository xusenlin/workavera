package chat

import (
	"context"
	"errors"
	"net/http"

	"github.com/google/uuid"
	"github.com/pocketbase/pocketbase/core"
	workagent "github.com/xusenlin/workavera/internal/agent"
)

var errApprovalNotPending = errors.New("approval is not pending")

type approvalDecision struct {
	Approved bool
}

type pendingApproval struct {
	toolCallID string
	toolName   string
	decision   chan approvalDecision
}

func (r *activeRun) awaitApproval(ctx context.Context, request workagent.ApprovalRequest, onPending func(string)) (string, approvalDecision, error) {
	approvalID := uuid.NewString()
	pending := &pendingApproval{
		toolCallID: request.ToolCallID,
		toolName:   request.ToolName,
		decision:   make(chan approvalDecision, 1),
	}

	r.mu.Lock()
	if r.done {
		r.mu.Unlock()
		return "", approvalDecision{}, context.Canceled
	}
	r.approvals[approvalID] = pending
	r.mu.Unlock()

	defer func() {
		r.mu.Lock()
		if r.approvals[approvalID] == pending {
			delete(r.approvals, approvalID)
		}
		r.mu.Unlock()
	}()

	onPending(approvalID)
	select {
	case decision := <-pending.decision:
		return approvalID, decision, nil
	case <-ctx.Done():
		return approvalID, approvalDecision{}, ctx.Err()
	}
}

func (r *activeRun) respondApproval(approvalID string, decision approvalDecision) error {
	r.mu.Lock()
	pending := r.approvals[approvalID]
	if pending != nil {
		delete(r.approvals, approvalID)
	}
	r.mu.Unlock()
	if pending == nil {
		return errApprovalNotPending
	}
	pending.decision <- decision
	return nil
}

type approvalResponseRequest struct {
	Approved *bool `json:"approved"`
}

func (s *service) respondApproval(event *core.RequestEvent) error {
	run := s.findRun(event.Request.PathValue("id"), event.Auth.Id)
	if run == nil {
		return event.NotFoundError("Active chat run not found.", nil)
	}

	var request approvalResponseRequest
	if err := event.BindBody(&request); err != nil || request.Approved == nil {
		return event.BadRequestError("An approval decision is required.", err)
	}
	if err := run.respondApproval(event.Request.PathValue("approvalId"), approvalDecision{Approved: *request.Approved}); err != nil {
		return event.Error(http.StatusConflict, "This approval has already been resolved or expired.", err)
	}
	return event.NoContent(http.StatusAccepted)
}
