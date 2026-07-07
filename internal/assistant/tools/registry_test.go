package tools

import "testing"

func TestFactoryRegistersOnlyProductionTools(t *testing.T) {
	factory := NewFactory(nil)
	registered := factory.ForActor("actor-1")
	if len(registered) != 3 {
		t.Fatalf("expected three production tools, got %d", len(registered))
	}
	names := map[string]bool{}
	for _, tool := range registered {
		names[tool.Info().Name] = true
	}
	if !names["fetch_and_show_contacts"] || !names["fetch_and_show_board_projects"] || !names["fetch_and_show_tasks"] || names["get_weather"] {
		t.Fatalf("unexpected production tool registry: %#v", names)
	}
}
