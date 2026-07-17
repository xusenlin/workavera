package mcpserver

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tests"
	"github.com/pocketbase/pocketbase/tools/types"

	assistanttools "github.com/xusenlin/workavera/internal/assistant/tools"
	_ "github.com/xusenlin/workavera/migrations"
)

func newTestUser(t *testing.T, app core.App) *core.Record {
	t.Helper()
	users, err := app.FindCollectionByNameOrId("users")
	if err != nil {
		t.Fatal(err)
	}
	user := core.NewRecord(users)
	user.SetEmail("mcp-key-test@workavera.local")
	user.SetPassword("workavera-test")
	user.SetVerified(true)
	user.Set("name", "MCP Key Test")
	if err := app.Save(user); err != nil {
		t.Fatal(err)
	}
	return user
}

func newKeyRecord(t *testing.T, app core.App, userID string, allowDestructive bool, expires types.DateTime) (record *core.Record, secret string) {
	t.Helper()
	collection, err := app.FindCollectionByNameOrId(apiKeysCollection)
	if err != nil {
		t.Fatal(err)
	}
	secret, hash, err := generateKeySecret()
	if err != nil {
		t.Fatal(err)
	}
	record = core.NewRecord(collection)
	record.Set("user", userID)
	record.Set("name", "test key")
	record.Set("prefix", secret[:keyDisplayLen])
	record.Set("key_hash", hash)
	record.Set("allow_destructive", allowDestructive)
	record.Set("expires", expires)
	if err := app.Save(record); err != nil {
		t.Fatal(err)
	}
	return record, secret
}

func TestGenerateKeySecret(t *testing.T) {
	first, firstHash, err := generateKeySecret()
	if err != nil {
		t.Fatal(err)
	}
	second, _, err := generateKeySecret()
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(first, keySecretPrefix) || len(first) != len(keySecretPrefix)+64 {
		t.Fatalf("unexpected secret format: %q", first)
	}
	if first == second {
		t.Fatal("secrets must be unique")
	}
	if len(firstHash) != 64 {
		t.Fatalf("unexpected hash length: %q", firstHash)
	}
}

func TestAuthenticateKey(t *testing.T) {
	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatal(err)
	}
	defer app.Cleanup()

	user := newTestUser(t, app)
	_, secret := newKeyRecord(t, app, user.Id, false, types.DateTime{})

	request := func(authorization string) *http.Request {
		req := httptest.NewRequest(http.MethodPost, "/api/mcp", nil)
		if authorization != "" {
			req.Header.Set("Authorization", authorization)
		}
		return req
	}

	record, err := authenticateKey(app, request("Bearer "+secret))
	if err != nil {
		t.Fatalf("valid key rejected: %v", err)
	}
	if record.GetString("user") != user.Id {
		t.Fatalf("unexpected key owner: %q", record.GetString("user"))
	}
	if record.GetDateTime("last_used").IsZero() {
		t.Fatal("expected last_used to be touched on authentication")
	}

	for name, authorization := range map[string]string{
		"missing header": "",
		"not bearer":     secret,
		"unknown key":    "Bearer " + keySecretPrefix + strings.Repeat("0", 64),
	} {
		if _, err := authenticateKey(app, request(authorization)); err == nil {
			t.Fatalf("%s must be rejected", name)
		}
	}

	expired, err := types.ParseDateTime(time.Now().Add(-time.Hour))
	if err != nil {
		t.Fatal(err)
	}
	_, expiredSecret := newKeyRecord(t, app, user.Id, false, expired)
	if _, err := authenticateKey(app, request("Bearer "+expiredSecret)); err == nil {
		t.Fatal("expired key must be rejected")
	}
}

func TestNewServerForKeyFiltersDestructiveTools(t *testing.T) {
	app, err := tests.NewTestApp()
	if err != nil {
		t.Fatal(err)
	}
	defer app.Cleanup()

	factory := assistanttools.NewFactory(app)
	user := newTestUser(t, app)

	listTools := func(allowDestructive bool) map[string]bool {
		record, _ := newKeyRecord(t, app, user.Id, allowDestructive, types.DateTime{})
		server := newServerForKey(app, factory, record, "test")

		ctx := context.Background()
		clientTransport, serverTransport := mcp.NewInMemoryTransports()
		serverSession, err := server.Connect(ctx, serverTransport, nil)
		if err != nil {
			t.Fatal(err)
		}
		defer serverSession.Close()
		client := mcp.NewClient(&mcp.Implementation{Name: "test-client", Version: "test"}, nil)
		clientSession, err := client.Connect(ctx, clientTransport, nil)
		if err != nil {
			t.Fatal(err)
		}
		defer clientSession.Close()

		result, err := clientSession.ListTools(ctx, nil)
		if err != nil {
			t.Fatal(err)
		}
		names := map[string]bool{}
		for _, tool := range result.Tools {
			names[tool.Name] = true
		}
		return names
	}

	restricted := listTools(false)
	if len(restricted) == 0 {
		t.Fatal("expected tools to be listed")
	}
	for name := range restricted {
		if assistanttools.IsDestructive(name) {
			t.Fatalf("destructive tool %q exposed without scope", name)
		}
	}
	if !restricted["contacts_search"] {
		t.Fatalf("expected contacts_search to be exposed, got: %v", restricted)
	}

	full := listTools(true)
	if !full["board_delete_task"] || !full["calendar_delete_event"] {
		t.Fatalf("destructive tools missing with scope enabled: %v", full)
	}
}
