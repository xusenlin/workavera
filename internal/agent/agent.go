package agent

import "context"

type Request struct {
	SystemPrompt   string
	Messages       []Message
	Model          ModelConfig
	ActorID        string
	ConversationID string
	UserMessageID  string
	Approval       ApprovalHandler
}

type ToolScope struct {
	ActorID        string
	ConversationID string
	UserMessageID  string
}

type EmitFunc func(context.Context, StreamChunk) error

type Runner interface {
	Stream(context.Context, Request, EmitFunc) (Result, error)
}
