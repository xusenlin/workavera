package mcpserver

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/types"
)

const (
	apiKeysCollection = "api_keys"
	keySecretPrefix   = "sk-wa-"
	keyDisplayLen     = 10
	lastUsedInterval  = time.Minute
)

var errInvalidKey = errors.New("invalid or expired API key")

// generateKeySecret returns the plaintext secret and its SHA-256 hex hash.
// The plaintext is shown to the user exactly once; only the hash is stored.
func generateKeySecret() (secret string, hash string, err error) {
	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		return "", "", err
	}
	secret = keySecretPrefix + hex.EncodeToString(raw)
	sum := sha256.Sum256([]byte(secret))
	return secret, hex.EncodeToString(sum[:]), nil
}

type createKeyRequest struct {
	Name             string `json:"name"`
	AllowDestructive bool   `json:"allowDestructive"`
	Expires          string `json:"expires"`
}

func createKey(e *core.RequestEvent) error {
	req := createKeyRequest{}
	if err := e.BindBody(&req); err != nil {
		return e.BadRequestError("Invalid request body.", err)
	}
	name := strings.TrimSpace(req.Name)
	if name == "" || len(name) > 100 {
		return e.BadRequestError("Key name must be between 1 and 100 characters.", nil)
	}
	var expires types.DateTime
	if strings.TrimSpace(req.Expires) != "" {
		parsed, err := types.ParseDateTime(req.Expires)
		if err != nil {
			return e.BadRequestError("Invalid expiration date.", err)
		}
		if !parsed.Time().After(time.Now()) {
			return e.BadRequestError("Expiration date must be in the future.", nil)
		}
		expires = parsed
	}

	secret, hash, err := generateKeySecret()
	if err != nil {
		return e.InternalServerError("Failed to generate API key.", err)
	}
	collection, err := e.App.FindCollectionByNameOrId(apiKeysCollection)
	if err != nil {
		return e.InternalServerError("API keys are unavailable.", err)
	}
	record := core.NewRecord(collection)
	record.Set("user", e.Auth.Id)
	record.Set("name", name)
	record.Set("prefix", secret[:keyDisplayLen])
	record.Set("key_hash", hash)
	record.Set("allow_destructive", req.AllowDestructive)
	record.Set("expires", expires)
	if err := e.App.Save(record); err != nil {
		return e.InternalServerError("Failed to save API key.", err)
	}

	return e.JSON(http.StatusOK, map[string]any{
		"id":               record.Id,
		"key":              secret,
		"prefix":           record.GetString("prefix"),
		"name":             name,
		"allowDestructive": req.AllowDestructive,
		"expires":          record.GetDateTime("expires"),
		"created":          record.GetDateTime("created"),
	})
}

// authenticateKey resolves the Bearer API key on an MCP request to its
// api_keys record, rejecting unknown and expired keys.
func authenticateKey(app core.App, r *http.Request) (*core.Record, error) {
	token, ok := strings.CutPrefix(r.Header.Get("Authorization"), "Bearer ")
	token = strings.TrimSpace(token)
	if !ok || !strings.HasPrefix(token, keySecretPrefix) {
		return nil, errInvalidKey
	}
	sum := sha256.Sum256([]byte(token))
	record, err := app.FindFirstRecordByFilter(
		apiKeysCollection,
		"key_hash = {:hash}",
		dbx.Params{"hash": hex.EncodeToString(sum[:])},
	)
	if err != nil {
		return nil, errInvalidKey
	}
	expires := record.GetDateTime("expires")
	if !expires.IsZero() && !expires.Time().After(time.Now()) {
		return nil, errInvalidKey
	}
	touchLastUsed(app, record)
	return record, nil
}

// touchLastUsed records key activity at most once per lastUsedInterval to
// avoid a write on every MCP request.
func touchLastUsed(app core.App, record *core.Record) {
	last := record.GetDateTime("last_used")
	if !last.IsZero() && time.Since(last.Time()) < lastUsedInterval {
		return
	}
	record.Set("last_used", types.NowDateTime())
	if err := app.Save(record); err != nil {
		app.Logger().Error("failed to update api key last_used", "keyId", record.Id, "error", err)
	}
}
