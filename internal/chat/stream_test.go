package chat

import (
	"strings"
	"testing"
)

func TestSystemPromptKeepsEnvironmentAndGlobalToolRules(t *testing.T) {
	for _, rule := range []string{"free, open-source, self-hosted, AI-powered workspace", "Modules and navigation:", "Dashboard (/dashboard)", "Reading (/reading)", "Board (/board)", "Docs (/docs)", "Calendar (/calendar)", "Module boundaries:", "Tool results are rendered in custom UI", "do not repeat or list returned data", "Only mutate workspace data when the user explicitly asks", "Never guess IDs", "claim success"} {
		if !strings.Contains(baseSystemPrompt, rule) {
			t.Fatalf("system prompt is missing global tool rule %q", rule)
		}
	}
	for _, section := range []string{"Board tool rules:", "Calendar tool rules:", "Docs tool rules:"} {
		if strings.Contains(baseSystemPrompt, section) {
			t.Fatalf("system prompt still contains redundant section %q", section)
		}
	}
}
