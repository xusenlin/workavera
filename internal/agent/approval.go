package agent

import (
	"context"
	"errors"
)

var ErrApprovalUnavailable = errors.New("tool approval is unavailable")

// ApprovalRequest describes a tool action that must be approved before the
// tool may execute it. Target is presentation-only metadata resolved by the
// server; it must never be used as the source of truth for the mutation.
type ApprovalRequest struct {
	ToolCallID   string
	ToolName     string
	Title        string
	Summary      string
	Target       map[string]any
	Details      []ApprovalDetail
	Presentation ApprovalPresentation
}

// ApprovalDetail is one trusted, server-resolved fact shown in an approval
// card. Format and Tone are deliberately small enums interpreted by the UI.
type ApprovalDetail struct {
	Label  string `json:"label,omitempty"`
	Value  string `json:"value"`
	Format string `json:"format,omitempty"`
	Tone   string `json:"tone,omitempty"`
}

// ApprovalPresentation lets a tool describe its approval action without the
// frontend knowing the tool name. Empty fields fall back to generic labels.
type ApprovalPresentation struct {
	ConfirmLabel   string `json:"confirmLabel,omitempty"`
	ConfirmVariant string `json:"confirmVariant,omitempty"`
	PendingMessage string `json:"pendingMessage,omitempty"`
	SuccessMessage string `json:"successMessage,omitempty"`
	DeniedMessage  string `json:"deniedMessage,omitempty"`
	FailureMessage string `json:"failureMessage,omitempty"`
}

type ApprovalHandler func(context.Context, ApprovalRequest) (bool, error)

type approvalContextKey struct{}

func withApprovalHandler(ctx context.Context, handler ApprovalHandler) context.Context {
	if handler == nil {
		return ctx
	}
	return context.WithValue(ctx, approvalContextKey{}, handler)
}

// WithAutoApprove makes RequireApproval succeed without user interaction.
// It is meant for surfaces such as API-key access where the key's scope is
// the pre-authorization; never use it for interactive chat runs.
func WithAutoApprove(ctx context.Context) context.Context {
	return withApprovalHandler(ctx, func(context.Context, ApprovalRequest) (bool, error) {
		return true, nil
	})
}

// RequireApproval pauses the current tool call until the run's approval
// handler returns a decision or the run context is cancelled.
func RequireApproval(ctx context.Context, request ApprovalRequest) (bool, error) {
	handler, _ := ctx.Value(approvalContextKey{}).(ApprovalHandler)
	if handler == nil {
		return false, ErrApprovalUnavailable
	}
	return handler(ctx, request)
}
