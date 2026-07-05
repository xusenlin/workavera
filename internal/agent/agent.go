package agent

import "context"

type Request struct {
	SystemPrompt string
	Messages     []Message
	Model        ModelConfig
}

type EmitFunc func(context.Context, StreamChunk) error

type Runner interface {
	Stream(context.Context, Request, EmitFunc) (Result, error)
}
