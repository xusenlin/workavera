package mcpserver

import (
	"context"
	"encoding/json"
	"net/http"

	"charm.land/fantasy"
	"github.com/google/uuid"
	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"

	workagent "github.com/xusenlin/workavera/internal/agent"
	assistanttools "github.com/xusenlin/workavera/internal/assistant/tools"
)

type keyContextKey struct{}

// Register attaches the API key issuing endpoint and the MCP Streamable
// HTTP endpoint that exposes the assistant tools to third-party clients.
func Register(app core.App, version string) {
	factory := assistanttools.NewFactory(app)

	app.OnServe().BindFunc(func(event *core.ServeEvent) error {
		event.Router.POST("/api/apikeys", createKey).Bind(apis.RequireAuth("users"))

		handler := mcp.NewStreamableHTTPHandler(func(r *http.Request) *mcp.Server {
			key, ok := r.Context().Value(keyContextKey{}).(*core.Record)
			if !ok {
				return nil
			}
			return newServerForKey(event.App, factory, key, version)
		}, &mcp.StreamableHTTPOptions{Stateless: true})

		serveMCP := func(e *core.RequestEvent) error {
			key, err := authenticateKey(e.App, e.Request)
			if err != nil {
				e.Response.Header().Set("WWW-Authenticate", `Bearer realm="workavera-mcp"`)
				return e.UnauthorizedError("Invalid or expired API key.", err)
			}
			ctx := context.WithValue(e.Request.Context(), keyContextKey{}, key)
			handler.ServeHTTP(e.Response, e.Request.WithContext(ctx))
			return nil
		}
		// Explicit methods because a method-less pattern would conflict with
		// the embedded frontend's "GET /{path...}" catch-all route.
		event.Router.POST("/api/mcp", serveMCP)
		event.Router.GET("/api/mcp", serveMCP)
		event.Router.DELETE("/api/mcp", serveMCP)
		return event.Next()
	})
}

// newServerForKey builds a per-request MCP server scoped to the key's owner,
// excluding destructive tools unless the key was created with that scope.
func newServerForKey(app core.App, factory *assistanttools.Factory, key *core.Record, version string) *mcp.Server {
	allowDestructive := key.GetBool("allow_destructive")
	server := mcp.NewServer(&mcp.Implementation{
		Name:    "workavera",
		Title:   "Workavera",
		Version: version,
	}, &mcp.ServerOptions{
		Instructions: serverInstructions(allowDestructive),
	})
	for _, tool := range factory.ForActor(key.GetString("user")) {
		if assistanttools.IsDestructive(tool.Info().Name) && !allowDestructive {
			continue
		}
		server.AddTool(bridgeToolInfo(tool), bridgeToolHandler(tool, allowDestructive))
	}
	return server
}

// serverInstructions is sent to MCP clients at initialize; clients such as
// Claude Code surface it to the model as context about this server.
func serverInstructions(allowDestructive bool) string {
	instructions := "Workavera is a self-hosted AI team workspace. " +
		"These tools operate on the API key owner's account and cover their project boards " +
		"(projects, tasks, states, labels, members), personal calendar, documents, reading list, " +
		"and team contacts. Search tools return exact IDs; always look up an ID with a search or " +
		"get tool before creating, updating, or deleting anything."
	if allowDestructive {
		instructions += " Destructive tools (deleting tasks or calendar events) execute " +
			"immediately without user confirmation, so call them only when explicitly asked."
	} else {
		instructions += " This API key does not permit destructive operations; deleting tasks " +
			"or calendar events is unavailable."
	}
	return instructions
}

func bridgeToolInfo(tool fantasy.AgentTool) *mcp.Tool {
	info := tool.Info()
	required := info.Required
	if required == nil {
		required = []string{}
	}
	return &mcp.Tool{
		Name:        info.Name,
		Description: info.Description,
		InputSchema: map[string]any{
			"type":       "object",
			"properties": info.Parameters,
			"required":   required,
		},
	}
}

func bridgeToolHandler(tool fantasy.AgentTool, allowDestructive bool) mcp.ToolHandler {
	return func(ctx context.Context, req *mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		if allowDestructive {
			// The key scope is the pre-authorization, so approval-gated tools
			// must not wait for an interactive confirmation over MCP.
			ctx = workagent.WithAutoApprove(ctx)
		}
		input := req.Params.Arguments
		if len(input) == 0 {
			input = json.RawMessage("{}")
		}
		response, err := tool.Run(ctx, fantasy.ToolCall{
			ID:    uuid.NewString(),
			Name:  req.Params.Name,
			Input: string(input),
		})
		if err != nil {
			return nil, err
		}
		return &mcp.CallToolResult{
			Content: []mcp.Content{&mcp.TextContent{Text: response.Content}},
			IsError: response.IsError,
		}, nil
	}
}
