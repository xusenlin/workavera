package tools

import "testing"

func TestFactoryRegistersOnlyProductionTools(t *testing.T) {
	factory := NewFactory(nil)
	registered := factory.ForActor("actor-1")
	if len(registered) != 9 {
		t.Fatalf("expected nine production tools, got %d", len(registered))
	}
	names := map[string]bool{}
	for _, tool := range registered {
		names[tool.Info().Name] = true
	}
	for _, name := range []string{
		"fetch_and_show_contacts",
		"fetch_and_show_board_projects",
		"fetch_and_show_tasks",
		"create_html_app",
		"update_html_app",
		"get_html_app",
		"list_html_apps",
		"search_html_app",
		"replace_in_html_app",
	} {
		if !names[name] {
			t.Fatalf("missing production tool %q in registry: %#v", name, names)
		}
	}
	if names["get_weather"] {
		t.Fatalf("unexpected production tool registry: %#v", names)
	}
}
