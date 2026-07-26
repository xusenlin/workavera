package mcpclient

import (
	"context"
	"errors"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/types"
)

// maxUpstreamTools bounds how much a single refresh will read, so a
// misbehaving server cannot fill the record.
const maxUpstreamTools = 300

// refreshReport tells the user what a refresh changed. Names are grouped by
// what the user has to decide about them.
type refreshReport struct {
	Added       []string `json:"added"`
	Changed     []string `json:"changed"`
	Removed     []string `json:"removed"`
	Unchanged   []string `json:"unchanged"`
	Unsupported []string `json:"unsupported"`
}

// refreshServer is the only path by which upstream content becomes a tool the
// assistant can see. It never enables anything: a tool the user has not
// reviewed stays out of Chat.
func refreshServer(ctx context.Context, app core.App, record *core.Record) (refreshReport, error) {
	server, err := decodeServer(record)
	if err != nil {
		return refreshReport{}, err
	}

	session, err := connect(ctx, server, clientVersion())
	if err != nil {
		reason := classifyConnectError(err)
		record.Set("last_error", reason)
		if saveErr := app.Save(record); saveErr != nil {
			app.Logger().Error("could not record mcp refresh failure", "serverId", record.Id, "error", saveErr)
		}
		return refreshReport{}, errors.New(reason)
	}
	defer session.Close()

	upstream, err := listTools(ctx, session)
	if err != nil {
		reason := classifyConnectError(err)
		record.Set("last_error", reason)
		if saveErr := app.Save(record); saveErr != nil {
			app.Logger().Error("could not record mcp refresh failure", "serverId", record.Id, "error", saveErr)
		}
		return refreshReport{}, errors.New(reason)
	}

	definitions, report := reconcile(server, upstream)
	if err := saveTools(app, record, definitions); err != nil {
		return refreshReport{}, err
	}
	record.Set("last_error", "")
	record.Set("last_refreshed", types.NowDateTime())
	if err := app.Save(record); err != nil {
		return refreshReport{}, err
	}
	return report, nil
}

func listTools(ctx context.Context, session *mcp.ClientSession) ([]*mcp.Tool, error) {
	tools := make([]*mcp.Tool, 0, 32)
	cursor := ""
	for {
		result, err := session.ListTools(ctx, &mcp.ListToolsParams{Cursor: cursor})
		if err != nil {
			return nil, err
		}
		tools = append(tools, result.Tools...)
		if result.NextCursor == "" || len(tools) >= maxUpstreamTools {
			return tools, nil
		}
		cursor = result.NextCursor
	}
}

// reconcile merges an upstream listing into the locked definitions.
//
// A tool whose hash is unchanged keeps the user's enable and approval choices.
// Anything new or changed comes back disabled and needs review, which is what
// stops an upstream server from silently redefining what a tool does after the
// user has approved it.
func reconcile(server Server, upstream []*mcp.Tool) ([]ToolDefinition, refreshReport) {
	existing := make(map[string]ToolDefinition, len(server.Tools))
	for _, tool := range server.Tools {
		existing[tool.Name] = tool
	}

	report := refreshReport{
		Added:       []string{},
		Changed:     []string{},
		Removed:     []string{},
		Unchanged:   []string{},
		Unsupported: []string{},
	}
	definitions := make([]ToolDefinition, 0, len(upstream))
	seen := make(map[string]bool, len(upstream))

	for _, tool := range upstream {
		if tool == nil || tool.Name == "" || seen[tool.Name] {
			continue
		}
		seen[tool.Name] = true

		properties, required, err := flattenSchema(tool.InputSchema)
		if err != nil {
			report.Unsupported = append(report.Unsupported, tool.Name)
			continue
		}
		hash, err := definitionHash(tool.Description, properties, required)
		if err != nil {
			report.Unsupported = append(report.Unsupported, tool.Name)
			continue
		}

		definition := ToolDefinition{
			Name:        tool.Name,
			Description: tool.Description,
			Parameters:  properties,
			Required:    required,
			Hash:        hash,
		}

		previous, found := existing[tool.Name]
		switch {
		case found && previous.Hash == hash:
			definition.Enabled = previous.Enabled
			definition.Approval = previous.Approval
			// The definition matches upstream again, so any earlier suspicion
			// that it had drifted is resolved.
			definition.Stale = false
			report.Unchanged = append(report.Unchanged, tool.Name)
		case found:
			definition.Enabled = false
			definition.Approval = defaultApproval(server.ApprovalPolicy, tool.Annotations)
			report.Changed = append(report.Changed, tool.Name)
		default:
			definition.Enabled = false
			definition.Approval = defaultApproval(server.ApprovalPolicy, tool.Annotations)
			report.Added = append(report.Added, tool.Name)
		}
		definitions = append(definitions, definition)
	}

	for _, tool := range server.Tools {
		if !seen[tool.Name] {
			report.Removed = append(report.Removed, tool.Name)
		}
	}
	return definitions, report
}

// defaultApproval pre-selects an approval mode for a tool the user is about to
// review. Upstream annotations are the server's own claim about itself and so
// cannot be trusted at call time, but they are a reasonable starting point for
// a choice the user still has to confirm.
func defaultApproval(policy string, annotations *mcp.ToolAnnotations) string {
	switch policy {
	case policyNone:
		return approvalNever
	case policyWrites:
		if annotations != nil && annotations.ReadOnlyHint {
			return approvalNever
		}
		return approvalAlways
	default:
		return approvalAlways
	}
}
