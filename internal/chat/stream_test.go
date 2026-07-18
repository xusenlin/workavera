package chat

import (
	"strings"
	"testing"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"

	"github.com/xusenlin/workavera/internal/preferences"
	_ "github.com/xusenlin/workavera/migrations"
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

func TestSystemPromptUsesEffectiveMemoryPolicy(t *testing.T) {
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
	user.SetEmail("prompt-memory@example.com")
	user.SetPassword("password123")
	user.Set("name", "Prompt Memory")
	if err := app.Save(user); err != nil {
		t.Fatal(err)
	}
	if _, err := preferences.Ensure(app, user.Id); err != nil {
		t.Fatal(err)
	}

	disabled := buildSystemPrompt(app, user)
	if !strings.Contains(disabled, "Long-term Chat memory is disabled") || !strings.Contains(disabled, "complete set of active long-term memories available for this run is empty") || strings.Contains(disabled, "Saved Memories (complete") {
		t.Fatalf("unexpected disabled memory prompt: %s", disabled)
	}
	preference, err := app.FindFirstRecordByFilter(preferences.CollectionName, "owner = {:owner}", dbx.Params{"owner": user.Id})
	if err != nil {
		t.Fatal(err)
	}
	preference.Set("memory_enabled", true)
	if err := app.Save(preference); err != nil {
		t.Fatal(err)
	}
	memories, err := app.FindCollectionByNameOrId("chat_memories")
	if err != nil {
		t.Fatal(err)
	}
	memory := core.NewRecord(memories)
	memory.Set("owner", user.Id)
	memory.Set("category", "preference")
	memory.Set("content", "The user prefers concise replies.")
	memory.Set("active", true)
	memory.Set("origin", "manual")
	if err := app.Save(memory); err != nil {
		t.Fatal(err)
	}

	explicitOnly := buildSystemPrompt(app, user)
	for _, text := range []string{"Automatic capture is disabled", "system_memory_upsert", "complete and authoritative", "historical events", "A memory absent from Saved Memories", "Saved Memories (complete, authoritative", memory.Id, memory.GetString("content")} {
		if !strings.Contains(explicitOnly, text) {
			t.Fatalf("enabled prompt is missing %q: %s", text, explicitOnly)
		}
	}
	for _, text := range []string{"appearance=", "appearance preference", "theme="} {
		if strings.Contains(explicitOnly, text) {
			t.Fatalf("system prompt must not expose the user's theme via %q: %s", text, explicitOnly)
		}
	}
	preference.Set("memory_auto_capture", true)
	if err := app.Save(preference); err != nil {
		t.Fatal(err)
	}
	automatic := buildSystemPrompt(app, user)
	if !strings.Contains(automatic, "Automatic capture is enabled") {
		t.Fatalf("automatic prompt missing effective policy: %s", automatic)
	}
}
