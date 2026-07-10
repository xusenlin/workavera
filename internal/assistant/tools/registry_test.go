package tools

import "testing"

func TestFactoryRegistersOnlyProductionTools(t *testing.T) {
	factory := NewFactory(nil)
	registered := factory.ForActor("actor-1")
	if len(registered) != 15 {
		t.Fatalf("expected fifteen production tools, got %d", len(registered))
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
}
