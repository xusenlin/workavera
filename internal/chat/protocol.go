package chat

import (
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/pocketbase/pocketbase/core"
	workagent "github.com/xusenlin/workavera/internal/agent"
)

func prepareSSE(event *core.RequestEvent, runID string) {
	responseController := http.NewResponseController(event.Response)
	_ = responseController.SetWriteDeadline(time.Time{})
	header := event.Response.Header()
	header.Set("Content-Type", "text/event-stream")
	header.Set("Cache-Control", "no-cache")
	header.Set("Connection", "keep-alive")
	header.Set("X-Vercel-AI-UI-Message-Stream", "v1")
	header.Set("X-Accel-Buffering", "no")
	header.Set("X-Workavera-Run-Id", runID)
}

func writeSSE(event *core.RequestEvent, chunk workagent.StreamChunk) error {
	// Single chokepoint for the AI SDK UI Message Stream v1 contract: drop any
	// chunk that would serialize to a structurally invalid wire part (e.g. a
	// delta with empty content whose field is omitted by omitempty). The
	// persisted message is built upstream by the reducer from every chunk and is
	// unaffected, so this only prevents bad parts from reaching the browser.
	if !chunk.ValidForWire() {
		return nil
	}
	data, err := json.Marshal(chunk)
	if err != nil {
		return err
	}
	if _, err := fmt.Fprintf(event.Response, "data: %s\n\n", data); err != nil {
		return err
	}
	return event.Flush()
}

func writeSSEDone(event *core.RequestEvent) error {
	if _, err := fmt.Fprint(event.Response, "data: [DONE]\n\n"); err != nil {
		return err
	}
	return event.Flush()
}
