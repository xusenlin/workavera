package tools

import (
	"encoding/json"
	"testing"
)

func TestFactoryRegistersOnlyProductionTools(t *testing.T) {
	factory := NewFactory(nil)
	registered := factory.ForActor("actor-1")
	if len(registered) != 23 {
		t.Fatalf("expected twenty-three production tools, got %d", len(registered))
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
		"reading_search",
		"reading_upsert",
		"reading_get",
		"reading_summarize",
		"microapps_create",
		"microapps_update",
		"microapps_get",
		"microapps_list",
		"microapps_search",
		"microapps_replace",
		"microapps_write_chunk",
	} {
		if !names[name] {
			t.Fatalf("missing production tool %q in registry: %#v", name, names)
		}
	}
	if names["get_weather"] {
		t.Fatalf("unexpected production tool registry: %#v", names)
	}
	if names["board_delete_task"] || names["board_delete_project"] {
		t.Fatalf("destructive Board tools must not be registered: %#v", names)
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
