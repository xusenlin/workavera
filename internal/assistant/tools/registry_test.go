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
		"fetch_and_show_contacts",
		"fetch_and_show_board_projects",
		"fetch_and_show_tasks",
		"create_ai_micro_app",
		"update_ai_micro_app",
		"get_ai_micro_app",
		"list_ai_micro_apps",
		"search_ai_micro_app",
		"replace_in_ai_micro_app",
		"write_ai_micro_app_chunk",
	} {
		if !names[name] {
			t.Fatalf("missing production tool %q in registry: %#v", name, names)
		}
	}
	if names["get_weather"] {
		t.Fatalf("unexpected production tool registry: %#v", names)
	}
}
