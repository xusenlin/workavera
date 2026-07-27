package mcpclient

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"testing"

	"github.com/modelcontextprotocol/go-sdk/jsonrpc"
	"github.com/modelcontextprotocol/go-sdk/mcp"
)

func TestFlattenSchemaExpandsLocalRefs(t *testing.T) {
	// Fantasy rebuilds a tool schema as {type, properties, required} and drops
	// every other root keyword, so a $defs section would leave the $ref
	// pointers in properties dangling by the time the model sees them.
	schema := map[string]any{
		"type": "object",
		"$defs": map[string]any{
			"Filter": map[string]any{
				"type":       "object",
				"properties": map[string]any{"since": map[string]any{"type": "string"}},
			},
		},
		"properties": map[string]any{
			"filter": map[string]any{"$ref": "#/$defs/Filter", "description": "Optional filter"},
			"limit":  map[string]any{"type": "integer"},
		},
		"required": []any{"limit"},
	}

	properties, required, err := flattenSchema(schema)
	if err != nil {
		t.Fatal(err)
	}
	filter, ok := properties["filter"].(map[string]any)
	if !ok {
		t.Fatalf("filter property was not expanded: %#v", properties["filter"])
	}
	if _, stillReferenced := filter["$ref"]; stillReferenced {
		t.Fatal("expanded property must not keep its $ref")
	}
	if filter["type"] != "object" {
		t.Fatalf("expanded property lost its type: %#v", filter)
	}
	if filter["description"] != "Optional filter" {
		t.Fatalf("sibling keywords must survive expansion: %#v", filter)
	}
	if len(required) != 1 || required[0] != "limit" {
		t.Fatalf("unexpected required list: %#v", required)
	}
}

func TestFlattenSchemaRejectsUnresolvableRefs(t *testing.T) {
	schema := map[string]any{
		"type": "object",
		"properties": map[string]any{
			"remote": map[string]any{"$ref": "https://example.test/schema.json"},
		},
	}
	if _, _, err := flattenSchema(schema); !errors.Is(err, errUnsupportedSchema) {
		t.Fatalf("expected an unsupported schema error, got %v", err)
	}
}

func TestFlattenSchemaAcceptsMissingSchema(t *testing.T) {
	properties, required, err := flattenSchema(nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(properties) != 0 || len(required) != 0 {
		t.Fatalf("a tool without an input schema takes no arguments: %#v %#v", properties, required)
	}
}

func TestValidateArgumentsChecksMoreThanRequiredKeys(t *testing.T) {
	// Fantasy only checks that required keys are present, so type errors have
	// to be caught here or they reach upstream and get misread as drift.
	tool := ToolDefinition{
		Parameters: map[string]any{"limit": map[string]any{"type": "integer"}},
		Required:   []string{"limit"},
	}
	if err := validateArguments(tool, map[string]any{"limit": "ten"}); err == nil {
		t.Fatal("a string where an integer is required must fail validation")
	}
	if err := validateArguments(tool, map[string]any{"limit": float64(10)}); err != nil {
		t.Fatalf("valid arguments must pass: %v", err)
	}
	if err := validateArguments(tool, map[string]any{}); err == nil {
		t.Fatal("a missing required argument must fail validation")
	}
}

func TestReconcilePreservesChoicesOnlyWhenNothingChanged(t *testing.T) {
	server := Server{
		ApprovalPolicy: policyWrites,
		Tools: []ToolDefinition{
			{Name: "search", Description: "Search", Hash: hashFor(t, "Search"), Enabled: true, Approval: approvalNever},
			{Name: "purge", Description: "Purge", Hash: hashFor(t, "Purge"), Enabled: true, Approval: approvalAlways},
			{Name: "gone", Description: "Gone", Hash: hashFor(t, "Gone"), Enabled: true, Approval: approvalNever},
		},
	}
	upstream := []*mcp.Tool{
		{Name: "search", Description: "Search", InputSchema: emptySchema()},
		// Same name, new wording: this is the rug-pull shape, so the user's
		// earlier approval must not carry over.
		{Name: "purge", Description: "Purge everything, permanently", InputSchema: emptySchema()},
		{Name: "fresh", Description: "Fresh", InputSchema: emptySchema()},
	}

	definitions, report := reconcile(server, upstream)
	byName := map[string]ToolDefinition{}
	for _, definition := range definitions {
		byName[definition.Name] = definition
	}

	if search := byName["search"]; !search.Enabled || search.Approval != approvalNever {
		t.Fatalf("an unchanged tool must keep the user's choices: %#v", search)
	}
	if purge := byName["purge"]; purge.Enabled {
		t.Fatalf("a redefined tool must go back to disabled: %#v", purge)
	}
	if fresh := byName["fresh"]; fresh.Enabled || fresh.Approval != approvalAlways {
		t.Fatalf("a new tool must be disabled and require approval: %#v", fresh)
	}
	if len(report.Unchanged) != 1 || report.Unchanged[0] != "search" {
		t.Fatalf("unexpected unchanged report: %#v", report.Unchanged)
	}
	if len(report.Changed) != 1 || report.Changed[0] != "purge" {
		t.Fatalf("unexpected changed report: %#v", report.Changed)
	}
	if len(report.Added) != 1 || report.Added[0] != "fresh" {
		t.Fatalf("unexpected added report: %#v", report.Added)
	}
	if len(report.Removed) != 1 || report.Removed[0] != "gone" {
		t.Fatalf("unexpected removed report: %#v", report.Removed)
	}
}

func TestReconcileClearsStaleWhenDefinitionMatchesAgain(t *testing.T) {
	server := Server{
		ApprovalPolicy: policyWrites,
		Tools: []ToolDefinition{
			{Name: "search", Description: "Search", Hash: hashFor(t, "Search"), Enabled: true, Approval: approvalNever, Stale: true},
		},
	}
	definitions, _ := reconcile(server, []*mcp.Tool{
		{Name: "search", Description: "Search", InputSchema: emptySchema()},
	})
	if definitions[0].Stale {
		t.Fatal("a definition that matches upstream again is no longer suspect")
	}
}

func TestReconcileReportsUnsupportedSchemas(t *testing.T) {
	_, report := reconcile(Server{ApprovalPolicy: policyWrites}, []*mcp.Tool{
		{Name: "broken", InputSchema: map[string]any{
			"type":       "object",
			"properties": map[string]any{"x": map[string]any{"$ref": "#/$defs/Missing"}},
		}},
	})
	if len(report.Unsupported) != 1 || report.Unsupported[0] != "broken" {
		t.Fatalf("a tool whose schema cannot be resolved must be reported, not stored: %#v", report)
	}
}

func TestDefaultApprovalTreatsAnnotationsAsAdviceOnly(t *testing.T) {
	readOnly := &mcp.ToolAnnotations{ReadOnlyHint: true}
	if got := defaultApproval(policyWrites, readOnly); got != approvalNever {
		t.Fatalf("writes policy should pre-select no approval for a read-only tool, got %q", got)
	}
	if got := defaultApproval(policyWrites, nil); got != approvalAlways {
		t.Fatalf("writes policy should pre-select approval without an annotation, got %q", got)
	}
	// A server claiming to be read-only cannot talk its way past the strict
	// policy, because the claim comes from the server being judged.
	if got := defaultApproval(policyAll, readOnly); got != approvalAlways {
		t.Fatalf("the all policy must ignore the upstream hint, got %q", got)
	}
	if got := defaultApproval(policyNone, nil); got != approvalNever {
		t.Fatalf("the none policy should pre-select no approval, got %q", got)
	}
}

func TestClassifyCallError(t *testing.T) {
	cases := []struct {
		name             string
		err              error
		validationPassed bool
		want             outcome
	}{
		{
			name:             "unknown tool means the definition is gone",
			err:              &jsonrpc.Error{Code: jsonrpc.CodeInvalidParams, Message: "unknown tool: search"},
			validationPassed: true,
			want:             outcomeStale,
		},
		{
			name:             "invalid params after local validation means the schema drifted",
			err:              &jsonrpc.Error{Code: jsonrpc.CodeInvalidParams, Message: "missing property since"},
			validationPassed: true,
			want:             outcomeStale,
		},
		{
			name: "invalid params without local validation blames nobody",
			err:  &jsonrpc.Error{Code: jsonrpc.CodeInvalidParams, Message: "missing property since"},
			// Without the local check first, the same response could equally
			// be the model's fault, so it cannot imply drift.
			validationPassed: false,
			want:             outcomeUpstream,
		},
		{
			name:             "internal errors are the upstream server's own fault",
			err:              &jsonrpc.Error{Code: jsonrpc.CodeInternalError, Message: "database offline"},
			validationPassed: true,
			want:             outcomeUpstream,
		},
		{
			name:             "transport failures are server level",
			err:              errors.New("dial tcp: connection refused"),
			validationPassed: true,
			want:             outcomeUnreachable,
		},
		{
			name:             "a cancelled run is not a tool problem",
			err:              context.Canceled,
			validationPassed: true,
			want:             outcomeUnreachable,
		},
		{
			name:             "a wrapped protocol error is still classified",
			err:              fmt.Errorf("calling tool: %w", &jsonrpc.Error{Code: jsonrpc.CodeInvalidParams, Message: "tool not found"}),
			validationPassed: true,
			want:             outcomeStale,
		},
	}
	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			if got := classifyCallError(testCase.err, testCase.validationPassed); got != testCase.want {
				t.Fatalf("got outcome %d, want %d", got, testCase.want)
			}
		})
	}
}

func TestClassifyConnectErrorSeparatesCredentialsFromDrift(t *testing.T) {
	reason := classifyConnectError(errors.New("unexpected status 401 Unauthorized"))
	if !strings.Contains(reason, "credentials") {
		t.Fatalf("an expired credential must read as a credential problem, got %q", reason)
	}
	if strings.Contains(strings.ToLower(reason), "refresh") {
		t.Fatalf("a credential problem must not tell the user to refresh definitions, got %q", reason)
	}
}

func TestQualifiedToolNameStaysWithinProviderLimits(t *testing.T) {
	name := qualifiedToolName("notion", "search/pages")
	if strings.ContainsAny(name, "/") {
		t.Fatalf("tool name must be sanitized for provider function names, got %q", name)
	}
	if !strings.HasPrefix(name, "mcp_notion_") {
		t.Fatalf("tool name must be namespaced by slug, got %q", name)
	}
	long := qualifiedToolName("server", strings.Repeat("x", 200))
	if len(long) > 64 {
		t.Fatalf("tool name must be truncated to 64 characters, got %d", len(long))
	}
}

func TestEnabledToolsIgnoresDisabledServer(t *testing.T) {
	server := Server{
		Enabled: false,
		Tools:   []ToolDefinition{{Name: "search", Enabled: true}},
	}
	if len(server.EnabledTools()) != 0 {
		t.Fatal("a disabled server must contribute nothing regardless of stored definitions")
	}
	server.Enabled = true
	if len(server.EnabledTools()) != 1 {
		t.Fatal("an enabled server must contribute its enabled tools")
	}
}

func TestRequiresApprovalDefaultsToApproving(t *testing.T) {
	// An unset value must not read as "no approval needed".
	if !(ToolDefinition{}).RequiresApproval() {
		t.Fatal("a definition without an explicit approval mode must require approval")
	}
	if (ToolDefinition{Approval: approvalNever}).RequiresApproval() {
		t.Fatal("an explicit never must skip approval")
	}
}

func TestValidateEndpointRejectsNonHTTP(t *testing.T) {
	for _, endpoint := range []string{"", "ftp://example.test", "not a url", "http://"} {
		if err := validateEndpoint(endpoint); err == nil {
			t.Fatalf("expected %q to be rejected", endpoint)
		}
	}
	if err := validateEndpoint("https://example.test/mcp"); err != nil {
		t.Fatalf("a normal endpoint must be accepted: %v", err)
	}
}

func TestCountEnabledToolsExcludesTheServerBeingEdited(t *testing.T) {
	servers := []Server{
		{ID: "a", Tools: []ToolDefinition{{Enabled: true}, {Enabled: false}}},
		{ID: "b", Tools: []ToolDefinition{{Enabled: true}, {Enabled: true}}},
	}
	if got := countEnabledTools(servers, "b"); got != 1 {
		t.Fatalf("got %d enabled tools outside server b, want 1", got)
	}
}

func hashFor(t *testing.T, description string) string {
	t.Helper()
	hash, err := definitionHash(description, map[string]any{}, []string{})
	if err != nil {
		t.Fatal(err)
	}
	return hash
}

func emptySchema() map[string]any {
	return map[string]any{"type": "object", "properties": map[string]any{}}
}

func TestClassifyConnectErrorNamesTransportMismatch(t *testing.T) {
	// A legacy /sse endpoint only accepts GET, so posting the handshake to it
	// as Streamable HTTP returns 405. The bare status code tells the user
	// nothing, so the message has to name the likely cause.
	reason := classifyConnectError(errors.New(`calling "initialize": sending "initialize": Method Not Allowed`))
	if !strings.Contains(reason, "transport") {
		t.Fatalf("a 405 must be explained as a transport mismatch, got %q", reason)
	}
}

func TestClassifyConnectErrorExplainsRetiredEndpoint(t *testing.T) {
	// Servers retiring the legacy SSE transport answer with 410, and the SDK
	// reduces that to "Gone" before we can read the explanation they sent.
	reason := classifyConnectError(errors.New("failed to connect: Gone"))
	if !strings.Contains(reason, "retired") || !strings.Contains(reason, "/mcp") {
		t.Fatalf("a 410 must point at the Streamable HTTP endpoint, got %q", reason)
	}
}

func TestPresetsMatchDisabledInertShape(t *testing.T) {
	// A preset must never arrive with tool definitions already in place: that
	// would put an unreviewed upstream description in front of the model, which
	// is the one thing the locked-definition model exists to prevent. Guard the
	// declared list, since SeedPresets writes it verbatim.
	if len(presets) == 0 {
		t.Fatal("expected at least one preset")
	}
	seen := map[string]bool{}
	for _, item := range presets {
		if err := validateSlug(item.Slug); err != nil {
			t.Fatalf("preset %q has an invalid slug: %v", item.Name, err)
		}
		if err := validateName(item.Name); err != nil {
			t.Fatalf("preset %q has an invalid name: %v", item.Name, err)
		}
		if err := validateEndpoint(item.URL); err != nil {
			t.Fatalf("preset %q has an invalid url: %v", item.Name, err)
		}
		if seen[item.Slug] {
			t.Fatalf("preset slug %q is declared twice; the owner/slug index is unique", item.Slug)
		}
		seen[item.Slug] = true
	}
}

func TestSeedPresetsRequiresAnOwner(t *testing.T) {
	// The owner relation is required, so a preset cannot be created without
	// one; failing here beats writing a record the collection will reject.
	if err := SeedPresets(nil, ""); err == nil {
		t.Fatal("seeding without an owner must fail")
	}
}
