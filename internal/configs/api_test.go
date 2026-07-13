package configs

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"

	_ "github.com/xusenlin/workavera/migrations"
)

func TestSystemConfigAPI(t *testing.T) {
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
	user.SetEmail("config-user@example.com")
	user.SetPassword("password123")
	user.Set("name", "Config User")
	user.SetVerified(true)
	if err := app.Save(user); err != nil {
		t.Fatal(err)
	}
	token, err := user.NewAuthToken()
	if err != nil {
		t.Fatal(err)
	}

	Register(app)
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

	unauthorized := httptest.NewRecorder()
	handler.ServeHTTP(unauthorized, httptest.NewRequest(http.MethodGet, "/api/configs/system", nil))
	if unauthorized.Code != http.StatusUnauthorized {
		t.Fatalf("expected authentication, got %d", unauthorized.Code)
	}

	request := httptest.NewRequest(http.MethodGet, "/api/configs/system", nil)
	request.Header.Set("Authorization", token)
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("get system config: %d %s", response.Code, response.Body.String())
	}
	if !strings.Contains(response.Body.String(), `"timezone":"Asia/Shanghai"`) {
		t.Fatalf("system config should expose the timezone, got %s", response.Body.String())
	}
	if strings.Contains(response.Body.String(), "theme") {
		t.Fatalf("theme is a per-user preference and must not appear in system config, got %s", response.Body.String())
	}
}
