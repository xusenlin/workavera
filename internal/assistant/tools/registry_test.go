package tools

import (
	"context"
	"encoding/json"
	"slices"
	"strings"
	"testing"

	"charm.land/fantasy"
	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"

	workagent "github.com/xusenlin/workavera/internal/agent"
	"github.com/xusenlin/workavera/internal/preferences"
	"github.com/xusenlin/workavera/internal/sandbox"
	_ "github.com/xusenlin/workavera/migrations"
)

func TestFactoryRegistersOnlyProductionTools(t *testing.T) {
	factory := NewFactory(nil)
	registered := factory.ForActor("actor-1")
	if len(registered) != 33 {
		t.Fatalf("expected thirty-three production tools, got %d", len(registered))
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
		"calendar_search_events",
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
		"docs_ensure_folder",
		"docs_upsert",
		"docs_move",
		"docs_replace",
		"docs_rename",
		"docs_write_chunk",
		"resources_list",
		"resources_rename",
	} {
		if !names[name] {
			t.Fatalf("missing production tool %q in registry: %#v", name, names)
		}
	}
	if names["resources_search"] || names["resources_read_markdown"] {
		t.Fatalf("server-side resource content tools must not be registered: %#v", names)
	}
	if names["get_weather"] {
		t.Fatalf("unexpected production tool registry: %#v", names)
	}
	if names["board_delete_project"] {
		t.Fatalf("project deletion must not be registered: %#v", names)
	}
	// Download links are bearer credentials approved per call, so they must
	// never reach the MCP surface that ForActor feeds.
	if names["resources_create_download_url"] || names["resources_revoke_download_url"] {
		t.Fatalf("resource download link tools must be Chat-only: %#v", names)
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
	disabled := map[string]bool{}
	for _, tool := range factory.ForChat(workagent.ToolScope{ActorID: user.Id}) {
		disabled[tool.Info().Name] = true
	}
	if disabled["system_memory_upsert"] || disabled["system_memory_forget"] {
		t.Fatalf("disabled Chat memory added memory tools: %v", disabled)
	}
	if len(disabled) != len(base)+3 || !disabled["resources_create_download_url"] || !disabled["resources_revoke_download_url"] || !disabled["chat_send_files"] {
		t.Fatalf("Chat must add exactly the resource download link tools and chat_send_files: %v", disabled)
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
	if err := json.Unmarshal([]byte(`{"items":[{"taskId":"task-1","dueDate":null}]}`), &clear); err != nil {
		t.Fatal(err)
	}
	if len(clear.Items) != 1 || !clear.Items[0].dueDateSet || clear.Items[0].DueDate != nil {
		t.Fatalf("null dueDate must be an explicit clear: %#v", clear)
	}

	var omitted boardUpdateTaskInput
	if err := json.Unmarshal([]byte(`{"items":[{"taskId":"task-1"}]}`), &omitted); err != nil {
		t.Fatal(err)
	}
	if len(omitted.Items) != 1 || omitted.Items[0].dueDateSet {
		t.Fatalf("omitted dueDate must remain unchanged: %#v", omitted)
	}
}

func TestBoardSearchTasksSupportsCrossProjectKeywords(t *testing.T) {
	info := newBoardSearchTasksTool(nil, "actor-1").Info()
	if slices.Contains(info.Required, "projectId") {
		t.Fatalf("projectId must be optional for cross-project keyword search: %#v", info.Required)
	}
	for _, field := range []string{"query", "projectId", "stateIds", "userIds", "includeArchived", "limit"} {
		if _, ok := info.Parameters[field]; !ok {
			t.Fatalf("board_search_tasks missing input field %q: %#v", field, info.Parameters)
		}
	}
}

func TestCalendarSearchEventsAllowsListingWithoutAQuery(t *testing.T) {
	info := newCalendarSearchEventsTool(nil, "actor-1").Info()
	if slices.Contains(info.Required, "query") {
		t.Fatalf("query must be optional when listing all personal events: %#v", info.Required)
	}
	for _, field := range []string{"query", "from", "to"} {
		if _, ok := info.Parameters[field]; !ok {
			t.Fatalf("calendar_search_events missing input field %q: %#v", field, info.Parameters)
		}
	}
}

func TestBoardProjectArchiveIsNotExposedToAssistant(t *testing.T) {
	info := newBoardUpdateProjectTool(nil, "actor-1").Info()
	if _, ok := info.Parameters["archived"]; ok {
		t.Fatalf("board_update_project must not expose project archive state: %#v", info.Parameters)
	}
}

func TestBatchMutationToolsExposeOnlyArrayInputs(t *testing.T) {
	tests := []struct {
		name       string
		tool       fantasy.AgentTool
		properties []string
	}{
		{"board_upsert_state", newBoardUpsertStateTool(nil, "actor-1"), []string{"projectId", "items"}},
		{"board_upsert_label", newBoardUpsertLabelTool(nil, "actor-1"), []string{"projectId", "items"}},
		{"board_upsert_member", newBoardUpsertMemberTool(nil, "actor-1"), []string{"projectId", "items"}},
		{"board_create_task", newBoardCreateTaskTool(nil, "actor-1"), []string{"projectId", "items"}},
		{"board_update_task", newBoardUpdateTaskTool(nil, "actor-1"), []string{"items"}},
		{"calendar_create_event", newCalendarCreateEventTool(nil, "actor-1"), []string{"items"}},
		{"calendar_update_event", newCalendarUpdateEventTool(nil, "actor-1"), []string{"items"}},
		{"reading_upsert", newReadingUpsertTool(nil, "actor-1"), []string{"items"}},
		{"docs_move", newDocsMoveTool(nil, "actor-1"), []string{"items"}},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			info := test.tool.Info()
			if !slices.Contains(info.Required, "items") {
				t.Fatalf("items must be required: %#v", info.Required)
			}
			if len(info.Parameters) != len(test.properties) {
				t.Fatalf("unexpected top-level input properties: %#v", info.Parameters)
			}
			for _, property := range test.properties {
				if _, ok := info.Parameters[property]; !ok {
					t.Fatalf("missing input property %q: %#v", property, info.Parameters)
				}
			}
		})
	}
}

func TestBoardUpdateTaskRejectsLegacySingleObjectInput(t *testing.T) {
	response, err := newBoardUpdateTaskTool(nil, "actor-1").Run(context.Background(), fantasy.ToolCall{
		ID: "call-1", Name: "board_update_task", Input: `{"taskId":"task-1","priority":"high"}`,
	})
	if err != nil {
		t.Fatal(err)
	}
	if !response.IsError || !strings.Contains(response.Content, "at least one") {
		t.Fatalf("legacy input must be rejected: %#v", response)
	}
}

func TestBoardUpdateTaskRejectsEmptyPatch(t *testing.T) {
	response, err := newBoardUpdateTaskTool(nil, "actor-1").Run(context.Background(), fantasy.ToolCall{
		ID: "call-1", Name: "board_update_task", Input: `{"items":[{"taskId":"task-1"}]}`,
	})
	if err != nil {
		t.Fatal(err)
	}
	var result batchResult
	if err := json.Unmarshal([]byte(response.Content), &result); err != nil {
		t.Fatal(err)
	}
	if result.OK || result.Failed != 1 || len(result.Results) != 1 || !strings.Contains(result.Results[0].Error, "at least one field") {
		t.Fatalf("empty patch must fail with a useful item error: %#v", result)
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
	for _, field := range []string{"items"} {
		if !slices.Contains(info.Required, field) {
			t.Fatalf("docs_move missing required field %q: %#v", field, info.Required)
		}
	}
}

func TestSandboxToolsAreChatOnlyAndPreferenceGated(t *testing.T) {
	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatal(err)
	}
	defer app.Cleanup()
	sandbox.Register(app)
	users, err := app.FindCollectionByNameOrId("users")
	if err != nil {
		t.Fatal(err)
	}
	user := core.NewRecord(users)
	user.SetEmail("sandbox-tools@example.com")
	user.SetPassword("password123")
	user.Set("name", "Sandbox Tools")
	if err := app.Save(user); err != nil {
		t.Fatal(err)
	}
	factory := NewFactory(app)
	sandboxNames := func(tools []fantasy.AgentTool) []string {
		var names []string
		for _, tool := range tools {
			if strings.HasPrefix(tool.Info().Name, "sandbox_") {
				names = append(names, tool.Info().Name)
			}
		}
		return names
	}

	if names := sandboxNames(factory.ForChat(workagent.ToolScope{ActorID: user.Id})); len(names) != 0 {
		t.Fatalf("a sandbox that is off must add no tools: %v", names)
	}
	if _, err := preferences.Set(app, user.Id, "sandbox_enabled", true); err != nil {
		t.Fatal(err)
	}
	if names := sandboxNames(factory.ForActor(user.Id)); len(names) != 0 {
		t.Fatalf("sandbox tools must never reach MCP or API keys: %v", names)
	}
	names := sandboxNames(factory.ForChat(workagent.ToolScope{ActorID: user.Id}))
	if sandbox.For(app).ToolsEnabled(context.Background(), user.Id) {
		if len(names) != 6 {
			t.Fatalf("an available sandbox must add its six tools: %v", names)
		}
	} else if len(names) != 0 {
		t.Fatalf("an unavailable sandbox must add no tools: %v", names)
	}
}
