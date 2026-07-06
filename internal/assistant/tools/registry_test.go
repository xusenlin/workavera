package tools

import "testing"

func TestFactoryRegistersOnlyProductionTools(t *testing.T) {
	factory := NewFactory(nil)
	registered := factory.ForActor("actor-1")
	if len(registered) != 2 {
		t.Fatalf("expected two production tools, got %d", len(registered))
	}
	names := map[string]bool{}
	for _, tool := range registered {
		names[tool.Info().Name] = true
	}
	if !names["get_contacts"] || !names["get_board_projects"] || names["get_weather"] {
		t.Fatalf("unexpected production tool registry: %#v", names)
	}
}
