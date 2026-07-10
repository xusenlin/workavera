package tools

import "testing"

func TestFactoryRegistersOnlyProductionTools(t *testing.T) {
	factory := NewFactory(nil)
	registered := factory.ForActor("actor-1")
	if len(registered) != 10 {
		t.Fatalf("expected ten production tools, got %d", len(registered))
	}
	names := map[string]bool{}
	for _, tool := range registered {
		names[tool.Info().Name] = true
	}
	for _, name := range []string{
		"contacts_search",
		"board_search_projects",
		"board_search_tasks",
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
