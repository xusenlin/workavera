package agent

import (
	"context"
	"errors"
	"testing"

	"charm.land/fantasy"
)

type streamingTextModel struct {
	generateCalled bool
	streamCall     fantasy.Call
}

func (m *streamingTextModel) Generate(context.Context, fantasy.Call) (*fantasy.Response, error) {
	m.generateCalled = true
	return nil, errors.New("non-streaming generation must not be used")
}

func (m *streamingTextModel) Stream(_ context.Context, call fantasy.Call) (fantasy.StreamResponse, error) {
	m.streamCall = call
	return func(yield func(fantasy.StreamPart) bool) {
		if !yield(fantasy.StreamPart{Type: fantasy.StreamPartTypeTextStart, ID: "text-1"}) {
			return
		}
		if !yield(fantasy.StreamPart{Type: fantasy.StreamPartTypeTextDelta, ID: "text-1", Delta: "streamed summary"}) {
			return
		}
		if !yield(fantasy.StreamPart{Type: fantasy.StreamPartTypeTextEnd, ID: "text-1"}) {
			return
		}
		yield(fantasy.StreamPart{Type: fantasy.StreamPartTypeFinish, FinishReason: fantasy.FinishReasonStop})
	}, nil
}

func (m *streamingTextModel) GenerateObject(context.Context, fantasy.ObjectCall) (*fantasy.ObjectResponse, error) {
	return nil, errors.New("not implemented")
}

func (m *streamingTextModel) StreamObject(context.Context, fantasy.ObjectCall) (fantasy.ObjectStreamResponse, error) {
	return nil, errors.New("not implemented")
}

func (m *streamingTextModel) Provider() string { return "test" }
func (m *streamingTextModel) Model() string    { return "test-model" }

func TestGenerateTextUsesStreamingTransport(t *testing.T) {
	model := &streamingTextModel{}

	text, err := generateText(context.Background(), model, 65536, "Summarize accurately.", "Article body")
	if err != nil {
		t.Fatalf("generateText returned an error: %v", err)
	}
	if text != "streamed summary" {
		t.Fatalf("unexpected generated text: %q", text)
	}
	if model.generateCalled {
		t.Fatal("generateText called the non-streaming model method")
	}
	if model.streamCall.MaxOutputTokens == nil || *model.streamCall.MaxOutputTokens != 65536 {
		t.Fatalf("unexpected max output tokens: %v", model.streamCall.MaxOutputTokens)
	}
}
