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

	request := httptest.NewRequest(http.MethodPatch, "/api/configs/system", strings.NewReader(`{"timezone":"UTC","theme":"dark"}`))
	request.Header.Set("Authorization", token)
	request.Header.Set("content-type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK || SystemLocation(app).String() != "UTC" || SystemTheme(app) != "dark" {
		t.Fatalf("update timezone: %d %s", response.Code, response.Body.String())
	}

	invalid := httptest.NewRequest(http.MethodPatch, "/api/configs/system", strings.NewReader(`{"timezone":"Invalid/Timezone"}`))
	invalid.Header.Set("Authorization", token)
	invalid.Header.Set("content-type", "application/json")
	invalidResponse := httptest.NewRecorder()
	handler.ServeHTTP(invalidResponse, invalid)
	if invalidResponse.Code != http.StatusBadRequest || SystemLocation(app).String() != "UTC" {
		t.Fatalf("invalid timezone should be rejected: %d %s", invalidResponse.Code, invalidResponse.Body.String())
	}
}
