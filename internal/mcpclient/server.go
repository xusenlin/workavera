// Package mcpclient lets each user connect their own third-party MCP servers
// and use those servers' tools inside Chat.
//
// The integration rests on two decisions documented in doc/mcp-client-prd.md:
// tool definitions are a snapshot the user has explicitly accepted (they are
// never a live view of the upstream server), and no upstream connection
// outlives the call that opened it. Together they mean assembling tools for a
// Chat run performs no network I/O at all.
package mcpclient

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"regexp"
	"strings"

	"github.com/pocketbase/pocketbase/core"
)

const (
	collectionName = "mcp_servers"

	maxServersPerOwner = 10
	maxEnabledTools    = 100
	maxNameLength      = 100
	maxURLLength       = 2000
	maxHeaders         = 10
	maxHeaderLength    = 4096
)

// approval modes stored on a locked tool definition.
const (
	approvalAlways = "always"
	approvalNever  = "never"
)

// approval policies applied to newly discovered tools.
const (
	policyAll    = "all"
	policyWrites = "writes"
	policyNone   = "none"
)

var (
	slugPattern       = regexp.MustCompile(`^[a-z][a-z0-9_]{0,19}$`)
	headerNamePattern = regexp.MustCompile(`^[A-Za-z0-9-]{1,64}$`)
)

// preset is a well-known public MCP endpoint offered to a new account so the
// feature is not an empty screen. Presets need no credentials.
type preset struct {
	Name string
	Slug string
	URL  string
}

// presets is deliberately a second copy of the list in the migration that
// created this collection. The migration is frozen history: it seeds the
// accounts that existed when it ran, and must keep working when replayed from
// scratch even after this list changes. Editing this list therefore changes
// what new accounts get, and backfilling existing accounts needs its own
// migration.
var presets = []preset{
	{Name: "Hugging Face", Slug: "huggingface", URL: "https://hf.co/mcp"},
	{Name: "DeepWiki", Slug: "deepwiki", URL: "https://mcp.deepwiki.com/mcp"},
	{Name: "Exa Search", Slug: "exa", URL: "https://mcp.exa.ai/mcp"},
}

// SeedPresets gives an account the preset endpoints, disabled and with no tool
// definitions. The user still has to refresh each server and choose tools, so a
// preset reaches Chat only after the same review every other server goes
// through. Slugs already present are left alone, so this is safe to re-run.
func SeedPresets(app core.App, ownerID string) error {
	if ownerID == "" {
		return errors.New("preset owner is required")
	}
	collection, err := app.FindCollectionByNameOrId(collectionName)
	if err != nil {
		return err
	}
	existing, err := ownedServers(app, ownerID)
	if err != nil {
		return err
	}
	taken := make(map[string]bool, len(existing))
	for _, server := range existing {
		taken[server.Slug] = true
	}

	for _, item := range presets {
		if taken[item.Slug] {
			continue
		}
		record := core.NewRecord(collection)
		record.Set("owner", ownerID)
		record.Set("name", item.Name)
		record.Set("slug", item.Slug)
		record.Set("transport", "http")
		record.Set("url", item.URL)
		record.Set("headers", "{}")
		record.Set("approval_policy", policyWrites)
		record.Set("enabled", false)
		record.Set("tools", "[]")
		if err := app.Save(record); err != nil {
			return err
		}
	}
	return nil
}

// ToolDefinition is one locked tool. It is the complete description the
// assistant is given: nothing is read from upstream when a call is made.
type ToolDefinition struct {
	Name        string         `json:"name"`
	Description string         `json:"description"`
	Parameters  map[string]any `json:"parameters"`
	Required    []string       `json:"required"`
	Enabled     bool           `json:"enabled"`
	Approval    string         `json:"approval"`
	Hash        string         `json:"hash"`
	// Stale marks a definition that a call indicated no longer matches
	// upstream. It is a suspicion raised for the user, not a confirmed change.
	Stale bool `json:"stale"`
}

// RequiresApproval reports whether a call must pass the Chat approval gate.
// Only the stored value is consulted; upstream annotations are advisory input
// at review time and never affect runtime behaviour.
func (t ToolDefinition) RequiresApproval() bool {
	return t.Approval != approvalNever
}

// Server is the decoded form of an mcp_servers record.
type Server struct {
	ID             string
	Name           string
	Slug           string
	Transport      string
	URL            string
	Headers        map[string]string
	ApprovalPolicy string
	Enabled        bool
	Tools          []ToolDefinition
}

func decodeServer(record *core.Record) (Server, error) {
	server := Server{
		ID:             record.Id,
		Name:           record.GetString("name"),
		Slug:           record.GetString("slug"),
		Transport:      record.GetString("transport"),
		URL:            record.GetString("url"),
		ApprovalPolicy: record.GetString("approval_policy"),
		Enabled:        record.GetBool("enabled"),
	}
	if raw := record.GetString("headers"); raw != "" && raw != "null" {
		if err := json.Unmarshal([]byte(raw), &server.Headers); err != nil {
			return Server{}, fmt.Errorf("could not decode headers: %w", err)
		}
	}
	if raw := record.GetString("tools"); raw != "" && raw != "null" {
		if err := json.Unmarshal([]byte(raw), &server.Tools); err != nil {
			return Server{}, fmt.Errorf("could not decode tools: %w", err)
		}
	}
	return server, nil
}

// EnabledTools returns the definitions this server contributes to a Chat run.
// A disabled server contributes nothing regardless of what it has stored.
func (s Server) EnabledTools() []ToolDefinition {
	if !s.Enabled {
		return nil
	}
	tools := make([]ToolDefinition, 0, len(s.Tools))
	for _, tool := range s.Tools {
		if tool.Enabled {
			tools = append(tools, tool)
		}
	}
	return tools
}

func validateName(name string) error {
	if name == "" || len(name) > maxNameLength {
		return fmt.Errorf("name must be between 1 and %d characters", maxNameLength)
	}
	return nil
}

func validateSlug(slug string) error {
	if !slugPattern.MatchString(slug) {
		return errors.New("slug must start with a letter and contain only lowercase letters, digits, and underscores")
	}
	return nil
}

func validateTransport(transport string) error {
	if transport != "http" && transport != "sse" {
		return errors.New("transport must be http or sse")
	}
	return nil
}

func validatePolicy(policy string) error {
	switch policy {
	case policyAll, policyWrites, policyNone:
		return nil
	default:
		return errors.New("approval policy must be all, writes, or none")
	}
}

// validateEndpoint keeps the stored URL to an absolute http(s) endpoint. The
// deployment is self-hosted and the operator is the user, so this is a
// correctness check rather than a network boundary.
func validateEndpoint(endpoint string) error {
	if endpoint == "" || len(endpoint) > maxURLLength {
		return fmt.Errorf("url must be between 1 and %d characters", maxURLLength)
	}
	parsed, err := url.Parse(endpoint)
	if err != nil {
		return errors.New("url is not a valid URL")
	}
	if parsed.Scheme != "http" && parsed.Scheme != "https" {
		return errors.New("url must use http or https")
	}
	if parsed.Host == "" {
		return errors.New("url must include a host")
	}
	return nil
}

func validateHeaders(headers map[string]string) error {
	if len(headers) > maxHeaders {
		return fmt.Errorf("a server can define at most %d headers", maxHeaders)
	}
	for name, value := range headers {
		if !headerNamePattern.MatchString(name) {
			return fmt.Errorf("header name %q is not valid", name)
		}
		if len(value) > maxHeaderLength {
			return fmt.Errorf("header %q is too long", name)
		}
	}
	return nil
}

// countEnabledTools totals enabled tools across every server an owner has, so
// the tool list injected into a run stays bounded.
func countEnabledTools(servers []Server, excludeID string) int {
	total := 0
	for _, server := range servers {
		if server.ID == excludeID {
			continue
		}
		for _, tool := range server.Tools {
			if tool.Enabled {
				total++
			}
		}
	}
	return total
}

// qualifiedToolName namespaces an upstream tool so it cannot collide with a
// built-in tool or with a tool of the same name on another server. Providers
// constrain function names to [a-zA-Z0-9_-]{1,64}.
func qualifiedToolName(slug, name string) string {
	var builder strings.Builder
	builder.WriteString("mcp_")
	builder.WriteString(slug)
	builder.WriteString("_")
	for _, char := range name {
		switch {
		case char >= 'a' && char <= 'z', char >= 'A' && char <= 'Z',
			char >= '0' && char <= '9', char == '_', char == '-':
			builder.WriteRune(char)
		default:
			builder.WriteRune('_')
		}
	}
	qualified := builder.String()
	if len(qualified) > 64 {
		qualified = qualified[:64]
	}
	return qualified
}
