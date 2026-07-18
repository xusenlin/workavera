package tools

import (
	"encoding/json"
	"slices"
	"strings"
	"testing"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"

	workagent "github.com/xusenlin/workavera/internal/agent"
	"github.com/xusenlin/workavera/internal/preferences"
	_ "github.com/xusenlin/workavera/migrations"
)

func TestFactoryRegistersOnlyProductionTools(t *testing.T) {
	factory := NewFactory(nil)
	registered := factory.ForActor("actor-1")
	if len(registered) != 28 {
		t.Fatalf("expected twenty-eight production tools, got %d", len(registered))
	}
	names := map[string]bool{}
	for _, tool := range registered {
		names[tool.Info().Name] = true
	}
	for _, name := range []string{
		"contacts_search",
		"board_search_projects",
		"board_get_project",
		"board_search_tasks",
		"board_list_templates",
		"board_create_project",
		"board_update_project",
		"board_upsert_state",
		"board_upsert_label",
		"board_upsert_member",
		"board_create_task",
		"board_update_task",
		"board_delete_task",
		"calendar_get_schedule",
		"calendar_create_event",
		"calendar_update_event",
		"calendar_delete_event",
		"reading_search",
		"reading_upsert",
		"reading_get",
		"reading_summarize",
		"docs_search",
		"docs_get",
		"docs_list_folders",
		"docs_upsert",
		"docs_move",
		"docs_replace",
		"docs_write_chunk",
	} {
		if !names[name] {
			t.Fatalf("missing production tool %q in registry: %#v", name, names)
		}
	}
	if names["get_weather"] {
		t.Fatalf("unexpected production tool registry: %#v", names)
	}
	if names["board_delete_project"] {
		t.Fatalf("project deletion must not be registered: %#v", names)
	}
}

func TestMemoryToolsAreChatOnlyAndPreferenceGated(t *testing.T) {
	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatal(err)
	}
	defer app.Cleanup()
	users, err := app.FindCollectionByNameOrId("users")
	if err != nil {
		t.Fatal(err)
	}
	user := core.NewRecord(users)
	user.SetEmail("memory-tools@example.com")
	user.SetPassword("password123")
	user.Set("name", "Memory Tools")
	if err := app.Save(user); err != nil {
		t.Fatal(err)
	}
	if _, err := preferences.Ensure(app, user.Id); err != nil {
		t.Fatal(err)
	}
	factory := NewFactory(app)

	base := map[string]bool{}
	for _, tool := range factory.ForActor(user.Id) {
		base[tool.Info().Name] = true
	}
	if base["system_memory_upsert"] || base["system_memory_forget"] {
		t.Fatalf("memory tools leaked into the base/MCP registry: %v", base)
	}
	disabled := factory.ForChat(workagent.ToolScope{ActorID: user.Id})
	if len(disabled) != len(base) {
		t.Fatalf("disabled Chat memory added tools: %d vs %d", len(disabled), len(base))
	}

	preference, err := app.FindFirstRecordByFilter(preferences.CollectionName, "owner = {:owner}", dbx.Params{"owner": user.Id})
	if err != nil {
		t.Fatal(err)
	}
	preference.Set("memory_enabled", true)
	if err := app.Save(preference); err != nil {
		t.Fatal(err)
	}
	chatNames := map[string]bool{}
	for _, tool := range factory.ForChat(workagent.ToolScope{ActorID: user.Id}) {
		chatNames[tool.Info().Name] = true
	}
	if !chatNames["system_memory_upsert"] || !chatNames["system_memory_forget"] {
		t.Fatalf("enabled Chat memory tools are missing: %v", chatNames)
	}
}

func TestBoardUpdateTaskInputTracksNullableDueDate(t *testing.T) {
	var clear boardUpdateTaskInput
	if err := json.Unmarshal([]byte(`{"taskId":"task-1","dueDate":null}`), &clear); err != nil {
		t.Fatal(err)
	}
	if !clear.dueDateSet || clear.DueDate != nil {
		t.Fatalf("null dueDate must be an explicit clear: %#v", clear)
	}

	var omitted boardUpdateTaskInput
	if err := json.Unmarshal([]byte(`{"taskId":"task-1"}`), &omitted); err != nil {
		t.Fatal(err)
	}
	if omitted.dueDateSet {
		t.Fatalf("omitted dueDate must remain unchanged: %#v", omitted)
	}
}

func TestDocsUpsertRequiresDocumentKindAndPromptsForChoice(t *testing.T) {
	info := newDocsUpsertTool(nil, "actor-1").Info()
	if !slices.Contains(info.Required, "kind") {
		t.Fatalf("docs_upsert kind must be required: %#v", info.Required)
	}
	for _, text := range []string{"ask them to choose", "Markdown", "HTML"} {
		if !strings.Contains(info.Description, text) {
			t.Fatalf("docs_upsert description is missing %q: %s", text, info.Description)
		}
	}
}

func TestDocsMoveRequiresExplicitUserRequest(t *testing.T) {
	info := newDocsMoveTool(nil, "actor-1").Info()
	if !strings.Contains(info.Description, "explicitly asks") {
		t.Fatalf("docs_move must require explicit user intent: %s", info.Description)
	}
	for _, field := range []string{"id", "destination"} {
		if !slices.Contains(info.Required, field) {
			t.Fatalf("docs_move missing required field %q: %#v", field, info.Required)
		}
	}
}
