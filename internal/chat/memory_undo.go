package chat

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/types"

	workagent "github.com/xusenlin/workavera/internal/agent"
	workmemory "github.com/xusenlin/workavera/internal/memory"
)

var (
	errMemoryActionNotFound = errors.New("memory action not found")
	errMemoryActionPending  = errors.New("memory action is not complete")
)

func (s *service) undoMemoryAction(event *core.RequestEvent) error {
	messageID := event.Request.PathValue("messageId")
	toolCallID := event.Request.PathValue("toolCallId")
	var undone workmemory.UpsertResult

	err := event.App.RunInTransaction(func(tx core.App) error {
		message, err := tx.FindRecordById(messagesCollection, messageID)
		if err != nil {
			return errMemoryActionNotFound
		}
		conversation, err := tx.FindRecordById(conversationsCollection, message.GetString("conversation"))
		if err != nil || conversation.GetString("owner") != event.Auth.Id {
			return errMemoryActionNotFound
		}
		if message.GetString("role") != "assistant" || message.GetString("status") != "complete" {
			return errMemoryActionPending
		}

		parts, err := decodeStoredParts(message)
		if err != nil {
			return err
		}
		partIndex := -1
		var original workmemory.UpsertResult
		for index, part := range parts {
			if part["type"] != "dynamic-tool" || part["toolCallId"] != toolCallID || part["toolName"] != "system_memory_upsert" {
				continue
			}
			if err := decodeMemoryUpsertResult(part["output"], &original); err != nil {
				return errMemoryActionNotFound
			}
			partIndex = index
			break
		}
		if partIndex < 0 {
			return errMemoryActionNotFound
		}
		if original.Action == "undone" {
			undone = original
			return nil
		}

		undone, err = workmemory.UndoUpsert(tx, event.Auth.Id, original)
		if err != nil {
			return err
		}
		parts[partIndex]["output"] = undone
		message.Set("parts", parts)
		return tx.Save(message)
	})
	if err != nil {
		switch {
		case errors.Is(err, errMemoryActionNotFound):
			return event.NotFoundError("Memory action not found.", err)
		case errors.Is(err, errMemoryActionPending):
			return event.Error(http.StatusConflict, "Wait for the Chat response to finish before undoing this memory.", err)
		case errors.Is(err, workmemory.ErrMemoryChanged):
			return event.Error(http.StatusConflict, "This memory changed after the Chat action. Manage it from Settings instead.", err)
		case errors.Is(err, workmemory.ErrUndoUnsupported):
			return event.BadRequestError("This memory action cannot be undone.", err)
		default:
			return event.InternalServerError("Could not undo the memory action.", err)
		}
	}
	return event.JSON(http.StatusOK, undone)
}

func decodeStoredParts(record *core.Record) ([]workagent.Part, error) {
	parts := []workagent.Part{}
	raw, ok := record.Get("parts").(types.JSONRaw)
	if !ok || len(raw) == 0 {
		return parts, nil
	}
	if err := json.Unmarshal(raw, &parts); err != nil {
		return nil, err
	}
	return parts, nil
}

func decodeMemoryUpsertResult(value any, target *workmemory.UpsertResult) error {
	if text, ok := value.(string); ok {
		return json.Unmarshal([]byte(text), target)
	}
	data, err := json.Marshal(value)
	if err != nil {
		return err
	}
	return json.Unmarshal(data, target)
}
