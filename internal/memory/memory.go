package memory

import (
	"errors"
	"sort"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"

	"github.com/xusenlin/workavera/internal/preferences"
)

const (
	CollectionName     = "chat_memories"
	MaxMemoriesPerUser = 50
)

var (
	ErrMemoryDisabled  = errors.New("Chat memory is disabled in Settings")
	ErrAutoCaptureOff  = errors.New("automatic memory capture is disabled in Settings")
	ErrMemoryLimit     = errors.New("you can save at most 50 memories")
	ErrMemoryNotFound  = errors.New("memory not found")
	ErrInvalidCategory = errors.New("unsupported memory category")
	ErrInvalidOrigin   = errors.New("unsupported memory origin")
	ErrInvalidContent  = errors.New("memory content must be between 1 and 500 characters")
	ErrMemoryChanged   = errors.New("memory changed after the original Chat action")
	ErrUndoUnsupported = errors.New("this memory action cannot be undone")
)

var categories = map[string]bool{
	"preference": true,
	"personal":   true,
	"work":       true,
	"goal":       true,
	"constraint": true,
}

type Memory struct {
	ID                 string `json:"id"`
	Owner              string `json:"owner"`
	Category           string `json:"category"`
	Content            string `json:"content"`
	Active             bool   `json:"active"`
	Origin             string `json:"origin"`
	SourceConversation string `json:"source_conversation,omitempty"`
	SourceMessage      string `json:"source_message,omitempty"`
	Created            string `json:"created"`
	Updated            string `json:"updated"`
}

type EditableSnapshot struct {
	Category string `json:"category"`
	Content  string `json:"content"`
	Active   bool   `json:"active"`
}

type UpsertInput struct {
	ID       string
	Category string
	Content  string
	Origin   string
}

type UpsertResult struct {
	Action         string            `json:"action"`
	OriginalAction string            `json:"original_action,omitempty"`
	Memory         Memory            `json:"memory"`
	Previous       *EditableSnapshot `json:"previous,omitempty"`
	UndoneAt       string            `json:"undone_at,omitempty"`
}

func Register(app core.App) {
	app.OnRecordCreateRequest(CollectionName).BindFunc(validateCreateRequest)
	app.OnRecordUpdateRequest(CollectionName).BindFunc(validateUpdateRequest)
}

func validateCreateRequest(event *core.RecordRequestEvent) error {
	if event.Auth == nil {
		return event.Next()
	}
	if err := validateValues(event.Record.GetString("category"), event.Record.GetString("content")); err != nil {
		return event.BadRequestError(err.Error(), err)
	}
	count, err := event.App.CountRecords(CollectionName, dbx.HashExp{"owner": event.Auth.Id})
	if err != nil {
		return event.BadRequestError("Could not verify the memory limit.", err)
	}
	if count >= MaxMemoriesPerUser {
		return event.BadRequestError(ErrMemoryLimit.Error(), ErrMemoryLimit)
	}
	event.Record.Set("owner", event.Auth.Id)
	event.Record.Set("content", strings.TrimSpace(event.Record.GetString("content")))
	event.Record.Set("origin", "manual")
	event.Record.Set("active", true)
	event.Record.Set("source_conversation", "")
	event.Record.Set("source_message", "")
	return event.Next()
}

func validateUpdateRequest(event *core.RecordRequestEvent) error {
	if err := validateValues(event.Record.GetString("category"), event.Record.GetString("content")); err != nil {
		return event.BadRequestError(err.Error(), err)
	}
	event.Record.Set("content", strings.TrimSpace(event.Record.GetString("content")))
	return event.Next()
}

func Upsert(app core.App, ownerID, conversationID, messageID string, input UpsertInput) (UpsertResult, error) {
	preference, err := preferences.Get(app, ownerID)
	if err != nil || !preference.MemoryEnabled {
		return UpsertResult{}, ErrMemoryDisabled
	}
	if input.Origin != "explicit" && input.Origin != "automatic" {
		return UpsertResult{}, ErrInvalidOrigin
	}
	if input.Origin == "automatic" && !preference.MemoryAutoCapture {
		return UpsertResult{}, ErrAutoCaptureOff
	}
	input.Category = strings.TrimSpace(input.Category)
	input.Content = strings.TrimSpace(input.Content)
	if err := validateValues(input.Category, input.Content); err != nil {
		return UpsertResult{}, err
	}

	if strings.TrimSpace(input.ID) != "" {
		record, err := findOwned(app, input.ID, ownerID)
		if err != nil {
			return UpsertResult{}, ErrMemoryNotFound
		}
		current := fromRecord(record)
		if current.Category == input.Category && current.Content == input.Content && current.Active {
			return UpsertResult{Action: "unchanged", Memory: current}, nil
		}
		previous := &EditableSnapshot{Category: current.Category, Content: current.Content, Active: current.Active}
		record.Set("category", input.Category)
		record.Set("content", input.Content)
		record.Set("active", true)
		if err := app.Save(record); err != nil {
			return UpsertResult{}, err
		}
		return UpsertResult{Action: "updated", Memory: fromRecord(record), Previous: previous}, nil
	}

	var created *core.Record
	err = app.RunInTransaction(func(tx core.App) error {
		count, err := tx.CountRecords(CollectionName, dbx.HashExp{"owner": ownerID})
		if err != nil {
			return err
		}
		if count >= MaxMemoriesPerUser {
			return ErrMemoryLimit
		}
		collection, err := tx.FindCollectionByNameOrId(CollectionName)
		if err != nil {
			return err
		}
		record := core.NewRecord(collection)
		record.Set("owner", ownerID)
		record.Set("category", input.Category)
		record.Set("content", input.Content)
		record.Set("active", true)
		record.Set("origin", input.Origin)
		record.Set("source_conversation", conversationID)
		record.Set("source_message", messageID)
		if err := tx.Save(record); err != nil {
			return err
		}
		created = record
		return nil
	})
	if err != nil {
		return UpsertResult{}, err
	}
	return UpsertResult{Action: "created", Memory: fromRecord(created)}, nil
}

// UndoUpsert reverses a completed Chat memory create or update when the
// underlying record still matches the tool result. Callers should run it in
// the same transaction that marks the persisted tool output as undone.
func UndoUpsert(app core.App, ownerID string, result UpsertResult) (UpsertResult, error) {
	if result.Action != "created" && result.Action != "updated" {
		return UpsertResult{}, ErrUndoUnsupported
	}
	record, err := findOwned(app, result.Memory.ID, ownerID)
	if err != nil {
		return UpsertResult{}, ErrMemoryChanged
	}
	current := fromRecord(record)
	if current.Updated != result.Memory.Updated ||
		current.Category != result.Memory.Category ||
		current.Content != result.Memory.Content ||
		current.Active != result.Memory.Active {
		return UpsertResult{}, ErrMemoryChanged
	}

	originalAction := result.Action
	switch originalAction {
	case "created":
		if err := app.Delete(record); err != nil {
			return UpsertResult{}, err
		}
	case "updated":
		if result.Previous == nil {
			return UpsertResult{}, ErrUndoUnsupported
		}
		record.Set("category", result.Previous.Category)
		record.Set("content", result.Previous.Content)
		record.Set("active", result.Previous.Active)
		if err := app.Save(record); err != nil {
			return UpsertResult{}, err
		}
		result.Memory = fromRecord(record)
	}

	result.Action = "undone"
	result.OriginalAction = originalAction
	result.Previous = nil
	result.UndoneAt = time.Now().UTC().Format(time.RFC3339Nano)
	return result, nil
}

func Forget(app core.App, ownerID, id string) (Memory, error) {
	preference, err := preferences.Get(app, ownerID)
	if err != nil || !preference.MemoryEnabled {
		return Memory{}, ErrMemoryDisabled
	}
	record, err := findOwned(app, id, ownerID)
	if err != nil {
		return Memory{}, ErrMemoryNotFound
	}
	memory := fromRecord(record)
	if err := app.Delete(record); err != nil {
		return Memory{}, err
	}
	return memory, nil
}

func ActiveForPrompt(app core.App, ownerID string) ([]Memory, error) {
	preference, err := preferences.Get(app, ownerID)
	if err != nil {
		return nil, err
	}
	if !preference.MemoryEnabled {
		return nil, nil
	}
	records, err := app.FindRecordsByFilter(
		CollectionName,
		"owner = {:owner} && active = true",
		"-updated",
		MaxMemoriesPerUser,
		0,
		dbx.Params{"owner": ownerID},
	)
	if err != nil {
		return nil, err
	}
	memories := make([]Memory, 0, len(records))
	for _, record := range records {
		memories = append(memories, fromRecord(record))
	}
	sort.SliceStable(memories, func(i, j int) bool {
		left := originPriority(memories[i].Origin)
		right := originPriority(memories[j].Origin)
		if left != right {
			return left < right
		}
		return memories[i].Updated > memories[j].Updated
	})

	return memories, nil
}

func findOwned(app core.App, id, ownerID string) (*core.Record, error) {
	return app.FindFirstRecordByFilter(
		CollectionName,
		"id = {:id} && owner = {:owner}",
		dbx.Params{"id": strings.TrimSpace(id), "owner": ownerID},
	)
}

func validateValues(category, content string) error {
	if !categories[strings.TrimSpace(category)] {
		return ErrInvalidCategory
	}
	length := utf8.RuneCountInString(strings.TrimSpace(content))
	if length == 0 || length > 500 {
		return ErrInvalidContent
	}
	return nil
}

func originPriority(origin string) int {
	switch origin {
	case "manual":
		return 0
	case "explicit":
		return 1
	default:
		return 2
	}
}

func fromRecord(record *core.Record) Memory {
	return Memory{
		ID:                 record.Id,
		Owner:              record.GetString("owner"),
		Category:           record.GetString("category"),
		Content:            record.GetString("content"),
		Active:             record.GetBool("active"),
		Origin:             record.GetString("origin"),
		SourceConversation: record.GetString("source_conversation"),
		SourceMessage:      record.GetString("source_message"),
		Created:            record.GetDateTime("created").String(),
		Updated:            record.GetDateTime("updated").String(),
	}
}
