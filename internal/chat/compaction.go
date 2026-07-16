package chat

import (
	"context"
	"fmt"
	"strings"

	"github.com/pocketbase/pocketbase/core"
	workagent "github.com/xusenlin/workavera/internal/agent"
)

const (
	// contextCompactionThreshold triggers compaction once the latest run's
	// context snapshot crosses this share of the model's context window.
	contextCompactionThreshold = 0.75
	// compactionKeepUserTurns is how many of the newest user turns stay
	// verbatim in the model-facing history after a compaction.
	compactionKeepUserTurns = 4
	// compactionPartLimit truncates individual part payloads in the
	// summarization transcript so oversized tool outputs cannot blow up the
	// summarization request itself.
	compactionPartLimit = 2000
)

const compactionSystemPrompt = `You maintain the running summary of a conversation between a user and an AI assistant.
Write a replacement summary that preserves everything needed to continue the conversation: user goals and preferences, decisions and their reasons, important facts, names and identifiers (IDs, URLs, file names), tool actions and their outcomes, and open questions or unfinished work.
Merge the previous summary (if any) with the new messages. Drop pleasantries and redundant detail. Write in the language the conversation is held in. Output only the summary text.`

// estimateContextTokens approximates the context size from the text sent to
// and produced by the model, for providers that do not report input usage
// (e.g. GLM's Anthropic-compatible endpoint always reports input_tokens as 0,
// which would otherwise show a tiny context and never trigger compaction).
// Roughly 4 ASCII characters or 1.5 CJK characters per token.
func estimateContextTokens(history []workagent.Message, parts []workagent.Part) int64 {
	var ascii, wide int64
	count := func(text string) {
		for _, r := range text {
			if r < 128 {
				ascii++
			} else {
				wide++
			}
		}
	}
	countValue := func(value any) {
		if value == nil {
			return
		}
		if text, ok := value.(string); ok {
			count(text)
			return
		}
		count(fmt.Sprintf("%v", value))
	}
	countParts := func(messageParts []workagent.Part) {
		for _, part := range messageParts {
			if text, _ := part["text"].(string); text != "" {
				count(text)
			}
			if part["type"] == "dynamic-tool" {
				countValue(part["input"])
				countValue(part["output"])
			}
		}
	}
	for _, message := range history {
		countParts(message.Parts)
	}
	countParts(parts)
	return ascii/4 + wide*2/3
}

// needsCompaction reports whether the conversation's latest context snapshot
// crossed the compaction threshold for the model's context window.
func needsCompaction(conversation *core.Record, model workagent.ModelConfig) bool {
	if model.MaxContextTokens <= 0 {
		return false
	}
	return float64(conversation.GetInt("context_tokens")) > contextCompactionThreshold*float64(model.MaxContextTokens)
}

// compactionPlan is the prepared input for one compaction: the summarization
// prompt and the new summary boundary it would establish.
type compactionPlan struct {
	prompt   string
	boundary int
}

// planCompaction loads the messages after the current summary boundary and
// prepares the summarization prompt, keeping the newest compactionKeepUserTurns
// user turns verbatim. It returns nil when there is nothing to compact.
func planCompaction(app core.App, conversation *core.Record, excludeID string) (*compactionPlan, error) {
	records, err := findMessagesAfter(app, conversation.Id, excludeID, summaryBoundary(conversation))
	if err != nil {
		return nil, err
	}
	cut := compactionCut(records, compactionKeepUserTurns)
	if cut == 0 {
		return nil, nil
	}
	compacted := records[:cut]

	var prompt strings.Builder
	if previous := conversation.GetString("context_summary"); previous != "" {
		prompt.WriteString("Previous summary:\n")
		prompt.WriteString(previous)
		prompt.WriteString("\n\n")
	}
	prompt.WriteString("New messages to merge into the summary:\n\n")
	for _, record := range compacted {
		message, err := decodeMessageRecord(record)
		if err != nil {
			return nil, err
		}
		prompt.WriteString(renderTranscriptMessage(message))
	}
	return &compactionPlan{
		prompt:   prompt.String(),
		boundary: compacted[len(compacted)-1].GetInt("sequence"),
	}, nil
}

// executeCompaction runs the summarization with the conversation's own model
// and persists the new summary and boundary. It re-fetches the conversation so
// concurrent field changes (e.g. a rename) are not clobbered, and returns the
// saved record.
func executeCompaction(ctx context.Context, app core.App, model workagent.ModelConfig, conversationID string, plan *compactionPlan) (*core.Record, error) {
	summary, err := workagent.GenerateText(ctx, model, compactionSystemPrompt, plan.prompt)
	if err != nil {
		return nil, err
	}
	summary = strings.TrimSpace(summary)
	if summary == "" {
		return nil, fmt.Errorf("summarization returned an empty summary")
	}
	record, err := app.FindRecordById(conversationsCollection, conversationID)
	if err != nil {
		return nil, err
	}
	record.Set("context_summary", summary)
	record.Set("summary_until_sequence", plan.boundary)
	if err := app.Save(record); err != nil {
		return nil, err
	}
	return record, nil
}

// compactionCut returns the index of the record that starts the kept tail:
// records[:cut] are summarized, records[cut:] stay verbatim. Records must be
// in ascending sequence order. The tail always starts at a user message so
// assistant tool_use/tool_result pairs are never split, and a conversation
// with keepUserTurns or fewer user turns yields 0 (nothing to compact).
func compactionCut(records []*core.Record, keepUserTurns int) int {
	seen := 0
	for index := len(records) - 1; index >= 0; index-- {
		if records[index].GetString("role") != "user" {
			continue
		}
		seen++
		if seen == keepUserTurns {
			return index
		}
	}
	return 0
}

// renderTranscriptMessage flattens one message into plain text for the
// summarization prompt. Reasoning parts are internal and skipped; tool calls
// keep their name plus truncated input/output so outcomes survive in the
// summary.
func renderTranscriptMessage(message workagent.Message) string {
	var b strings.Builder
	switch message.Role {
	case "user":
		b.WriteString("User:\n")
	default:
		b.WriteString("Assistant:\n")
	}
	for _, part := range message.Parts {
		switch part["type"] {
		case "text":
			if text, _ := part["text"].(string); text != "" {
				b.WriteString(truncateForTranscript(text))
				b.WriteString("\n")
			}
		case "dynamic-tool":
			toolName, _ := part["toolName"].(string)
			b.WriteString("[tool " + toolName + "]")
			if input := stringifyForTranscript(part["input"]); input != "" {
				b.WriteString(" input: " + input)
			}
			if state, _ := part["state"].(string); state == "output-error" {
				errorText, _ := part["errorText"].(string)
				b.WriteString(" error: " + truncateForTranscript(errorText))
			} else if output := stringifyForTranscript(part["output"]); output != "" {
				b.WriteString(" output: " + output)
			}
			b.WriteString("\n")
		}
	}
	b.WriteString("\n")
	return b.String()
}

func stringifyForTranscript(value any) string {
	if value == nil {
		return ""
	}
	if text, ok := value.(string); ok {
		return truncateForTranscript(text)
	}
	return truncateForTranscript(fmt.Sprintf("%v", value))
}

func truncateForTranscript(text string) string {
	runes := []rune(text)
	if len(runes) <= compactionPartLimit {
		return text
	}
	return string(runes[:compactionPartLimit]) + "…"
}
