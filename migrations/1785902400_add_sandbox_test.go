package migrations

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"
)

func TestSandboxMigration(t *testing.T) {
	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatal(err)
	}
	defer app.Cleanup()

	expected := map[string]string{
		"sandbox.enabled":              `true`,
		"sandbox.image":                `"ghcr.io/xusenlin/workavera-sandbox:4"`,
		"sandbox.network":              `true`,
		"sandbox.limits":               `{"cpus":2,"memory":"1g","pids":512}`,
		"sandbox.idle_timeout_minutes": `60`,
	}
	for key, value := range expected {
		record, err := app.FindFirstRecordByFilter(configsCollection, "key = {:key}", map[string]any{"key": key})
		if err != nil {
			t.Fatalf("missing %s: %v", key, err)
		}
		var stored, want any
		if err := json.Unmarshal([]byte(record.GetString("value")), &stored); err != nil {
			t.Fatalf("%s is not JSON: %v", key, err)
		}
		_ = json.Unmarshal([]byte(value), &want)
		storedJSON, _ := json.Marshal(stored)
		wantJSON, _ := json.Marshal(want)
		if !bytes.Equal(storedJSON, wantJSON) {
			t.Fatalf("%s = %s, want %s", key, storedJSON, wantJSON)
		}
		if record.GetString("description") == "" {
			t.Fatalf("%s needs a description for administrators", key)
		}
	}

	preferences, err := app.FindCollectionByNameOrId(userPreferencesCollection)
	if err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"sandbox_enabled", "sandbox_offline"} {
		if _, ok := preferences.Fields.GetByName(name).(*core.BoolField); !ok {
			t.Fatalf("missing %s", name)
		}
	}
	if preferences.UpdateRule == nil || !strings.HasSuffix(*preferences.UpdateRule, sandboxPreferenceGuard) {
		t.Fatalf("the sandbox switches must be guarded: %v", preferences.UpdateRule)
	}

	users, err := app.FindCollectionByNameOrId(usersCollectionName)
	if err != nil {
		t.Fatal(err)
	}
	user := core.NewRecord(users)
	user.SetEmail("sandbox-migration@example.com")
	user.SetPassword("password123")
	user.Set("name", "Sandbox")
	if err := app.Save(user); err != nil {
		t.Fatal(err)
	}
	preference := core.NewRecord(preferences)
	preference.Set("owner", user.Id)
	preference.Set("theme", "system")
	if err := app.Save(preference); err != nil {
		t.Fatal(err)
	}
	token, err := user.NewAuthToken()
	if err != nil {
		t.Fatal(err)
	}
	router, err := apis.NewRouter(app)
	if err != nil {
		t.Fatal(err)
	}
	if err := app.OnServe().Trigger(&core.ServeEvent{App: app, Router: router}, func(event *core.ServeEvent) error { return event.Next() }); err != nil {
		t.Fatal(err)
	}
	handler, err := router.BuildMux()
	if err != nil {
		t.Fatal(err)
	}
	patch := func(body map[string]any) int {
		data, _ := json.Marshal(body)
		request := httptest.NewRequest(http.MethodPatch, "/api/collections/user_preferences/records/"+preference.Id, bytes.NewReader(data))
		request.Header.Set("Authorization", token)
		request.Header.Set("Content-Type", "application/json")
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, request)
		return response.Code
	}
	if code := patch(map[string]any{"theme": "dark"}); code != http.StatusOK {
		t.Fatalf("other preferences must stay editable, got %d", code)
	}
	for _, field := range []string{"sandbox_enabled", "sandbox_offline"} {
		if code := patch(map[string]any{field: true}); code == http.StatusOK {
			t.Fatalf("%s must not be editable through the Records API", field)
		}
	}

	if err := dropSandbox(app); err != nil {
		t.Fatalf("drop sandbox: %v", err)
	}
	preferences, err = app.FindCollectionByNameOrId(userPreferencesCollection)
	if err != nil {
		t.Fatal(err)
	}
	if preferences.Fields.GetByName("sandbox_enabled") != nil || strings.Contains(*preferences.UpdateRule, "sandbox") {
		t.Fatal("dropping the sandbox must restore user_preferences")
	}
	if _, err := app.FindFirstRecordByFilter(configsCollection, `key = "sandbox.image"`); err == nil {
		t.Fatal("dropping the sandbox must remove its configs")
	}
}
