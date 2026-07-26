package mcpclient

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"sync/atomic"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
)

// version identifies this client to upstream servers during the MCP
// handshake. It is written once by Register during application bootstrap and
// only read afterwards.
var version atomic.Value

func clientVersion() string {
	if value, ok := version.Load().(string); ok {
		return value
	}
	return "dev"
}

// Register attaches the MCP server management routes.
//
// Reading and deleting a server use PocketBase's own collection rules. Writes
// go through these routes because they enforce the two invariants the feature
// rests on: credentials stay write-only, and tool definitions only ever come
// from a refresh the user accepted.
func Register(app core.App, appVersion string) {
	version.Store(appVersion)

	app.OnServe().BindFunc(func(event *core.ServeEvent) error {
		group := event.Router.Group("/api/mcp-servers").Bind(apis.RequireAuth("users"))
		group.POST("", createServer)
		group.PATCH("/{id}", updateServer)
		group.POST("/{id}/refresh", refresh)
		group.PATCH("/{id}/tools", updateTools)
		return event.Next()
	})
}

type createServerRequest struct {
	Name           string            `json:"name"`
	Slug           string            `json:"slug"`
	Transport      string            `json:"transport"`
	URL            string            `json:"url"`
	Headers        map[string]string `json:"headers"`
	ApprovalPolicy string            `json:"approvalPolicy"`
}

type updateServerRequest struct {
	Name           *string            `json:"name"`
	URL            *string            `json:"url"`
	Transport      *string            `json:"transport"`
	Headers        *map[string]string `json:"headers"`
	ApprovalPolicy *string            `json:"approvalPolicy"`
	Enabled        *bool              `json:"enabled"`
}

type updateToolsRequest struct {
	Tools []updateToolRequest `json:"tools"`
}

type updateToolRequest struct {
	Name     string `json:"name"`
	Enabled  bool   `json:"enabled"`
	Approval string `json:"approval"`
}

func createServer(event *core.RequestEvent) error {
	var request createServerRequest
	if err := event.BindBody(&request); err != nil {
		return event.BadRequestError("Invalid MCP server configuration.", err)
	}
	request.Name = strings.TrimSpace(request.Name)
	request.Slug = strings.TrimSpace(strings.ToLower(request.Slug))
	request.URL = strings.TrimSpace(request.URL)
	request.Transport = strings.TrimSpace(request.Transport)
	request.ApprovalPolicy = strings.TrimSpace(request.ApprovalPolicy)
	if request.ApprovalPolicy == "" {
		request.ApprovalPolicy = policyWrites
	}

	if err := validateName(request.Name); err != nil {
		return event.BadRequestError(err.Error(), nil)
	}
	if err := validateSlug(request.Slug); err != nil {
		return event.BadRequestError(err.Error(), nil)
	}
	if err := validateTransport(request.Transport); err != nil {
		return event.BadRequestError(err.Error(), nil)
	}
	if err := validateEndpoint(request.URL); err != nil {
		return event.BadRequestError(err.Error(), nil)
	}
	if err := validateHeaders(request.Headers); err != nil {
		return event.BadRequestError(err.Error(), nil)
	}
	if err := validatePolicy(request.ApprovalPolicy); err != nil {
		return event.BadRequestError(err.Error(), nil)
	}

	existing, err := ownedServers(event.App, event.Auth.Id)
	if err != nil {
		return event.InternalServerError("Could not load your MCP servers.", err)
	}
	if len(existing) >= maxServersPerOwner {
		return event.BadRequestError("You can register at most 10 MCP servers.", nil)
	}
	for _, server := range existing {
		if server.Slug == request.Slug {
			return event.BadRequestError("That slug is already used by another server.", nil)
		}
	}

	collection, err := event.App.FindCollectionByNameOrId(collectionName)
	if err != nil {
		return event.InternalServerError("MCP servers are unavailable.", err)
	}
	record := core.NewRecord(collection)
	record.Set("owner", event.Auth.Id)
	record.Set("name", request.Name)
	record.Set("slug", request.Slug)
	record.Set("transport", request.Transport)
	record.Set("url", request.URL)
	record.Set("approval_policy", request.ApprovalPolicy)
	record.Set("enabled", true)
	record.Set("tools", "[]")
	if err := setHeaders(record, request.Headers); err != nil {
		return event.InternalServerError("Could not store the request headers.", err)
	}
	if err := event.App.Save(record); err != nil {
		return event.BadRequestError("Could not save the MCP server.", err)
	}
	return event.JSON(http.StatusOK, toResponse(record))
}

func updateServer(event *core.RequestEvent) error {
	record, err := ownedServer(event)
	if err != nil {
		return err
	}
	var request updateServerRequest
	if err := event.BindBody(&request); err != nil {
		return event.BadRequestError("Invalid MCP server configuration.", err)
	}

	// A stored connection error describes the settings that produced it, so
	// changing any of them makes it stale and misleading. The next refresh or
	// call records a current one.
	connectionChanged := false

	if request.Name != nil {
		name := strings.TrimSpace(*request.Name)
		if err := validateName(name); err != nil {
			return event.BadRequestError(err.Error(), nil)
		}
		record.Set("name", name)
	}
	if request.URL != nil {
		endpoint := strings.TrimSpace(*request.URL)
		if err := validateEndpoint(endpoint); err != nil {
			return event.BadRequestError(err.Error(), nil)
		}
		if endpoint != record.GetString("url") {
			connectionChanged = true
		}
		record.Set("url", endpoint)
	}
	if request.Transport != nil {
		transport := strings.TrimSpace(*request.Transport)
		if err := validateTransport(transport); err != nil {
			return event.BadRequestError(err.Error(), nil)
		}
		if transport != record.GetString("transport") {
			connectionChanged = true
		}
		record.Set("transport", transport)
	}
	if request.ApprovalPolicy != nil {
		policy := strings.TrimSpace(*request.ApprovalPolicy)
		if err := validatePolicy(policy); err != nil {
			return event.BadRequestError(err.Error(), nil)
		}
		record.Set("approval_policy", policy)
	}
	if request.Headers != nil {
		if err := validateHeaders(*request.Headers); err != nil {
			return event.BadRequestError(err.Error(), nil)
		}
		if err := setHeaders(record, *request.Headers); err != nil {
			return event.InternalServerError("Could not store the request headers.", err)
		}
		connectionChanged = true
	}
	if request.Enabled != nil {
		record.Set("enabled", *request.Enabled)
	}
	if connectionChanged {
		record.Set("last_error", "")
	}

	if err := event.App.Save(record); err != nil {
		return event.BadRequestError("Could not update the MCP server.", err)
	}
	return event.JSON(http.StatusOK, toResponse(record))
}

func refresh(event *core.RequestEvent) error {
	record, err := ownedServer(event)
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(event.Request.Context(), refreshTimeout)
	defer cancel()

	report, refreshErr := refreshServer(ctx, event.App, record)
	if refreshErr != nil {
		return event.JSON(http.StatusOK, map[string]any{
			"ok":     false,
			"error":  refreshErr.Error(),
			"server": toResponse(record),
		})
	}
	return event.JSON(http.StatusOK, map[string]any{
		"ok":     true,
		"report": report,
		"server": toResponse(record),
	})
}

// updateTools applies the user's review decisions. It is the only way a tool
// becomes available to the assistant, and it can only touch the two fields the
// user owns: whether a tool is enabled and whether it needs approval.
func updateTools(event *core.RequestEvent) error {
	record, err := ownedServer(event)
	if err != nil {
		return err
	}
	var request updateToolsRequest
	if err := event.BindBody(&request); err != nil {
		return event.BadRequestError("Invalid tool selection.", err)
	}

	server, decodeErr := decodeServer(record)
	if decodeErr != nil {
		return event.InternalServerError("Could not read the stored tool definitions.", decodeErr)
	}

	decisions := make(map[string]updateToolRequest, len(request.Tools))
	for _, tool := range request.Tools {
		if tool.Approval != approvalAlways && tool.Approval != approvalNever {
			return event.BadRequestError("Approval must be always or never.", nil)
		}
		decisions[tool.Name] = tool
	}

	enabled := 0
	for index, tool := range server.Tools {
		decision, ok := decisions[tool.Name]
		if !ok {
			if tool.Enabled {
				enabled++
			}
			continue
		}
		server.Tools[index].Enabled = decision.Enabled
		server.Tools[index].Approval = decision.Approval
		if decision.Enabled {
			// Enabling a tool is the user accepting the current definition,
			// which is exactly what clears an earlier drift suspicion.
			server.Tools[index].Stale = false
			enabled++
		}
	}

	others, err := ownedServers(event.App, event.Auth.Id)
	if err != nil {
		return event.InternalServerError("Could not load your MCP servers.", err)
	}
	if countEnabledTools(others, record.Id)+enabled > maxEnabledTools {
		return event.BadRequestError("You can enable at most 100 MCP tools in total.", nil)
	}

	if err := saveTools(event.App, record, server.Tools); err != nil {
		return event.InternalServerError("Could not save the tool selection.", err)
	}
	return event.JSON(http.StatusOK, toResponse(record))
}

func ownedServer(event *core.RequestEvent) (*core.Record, error) {
	record, err := event.App.FindRecordById(collectionName, event.Request.PathValue("id"))
	if err != nil {
		return nil, event.NotFoundError("MCP server not found.", err)
	}
	if record.GetString("owner") != event.Auth.Id {
		// An MCP server holds the owner's personal upstream credentials and is
		// never shared, so a non-owner is told nothing about its existence.
		return nil, event.NotFoundError("MCP server not found.", nil)
	}
	return record, nil
}

func ownedServers(app core.App, ownerID string) ([]Server, error) {
	records, err := app.FindRecordsByFilter(
		collectionName,
		"owner = {:owner}",
		"created",
		0,
		0,
		dbx.Params{"owner": ownerID},
	)
	if err != nil {
		return nil, err
	}
	servers := make([]Server, 0, len(records))
	for _, record := range records {
		server, err := decodeServer(record)
		if err != nil {
			continue
		}
		servers = append(servers, server)
	}
	return servers, nil
}

func setHeaders(record *core.Record, headers map[string]string) error {
	if headers == nil {
		headers = map[string]string{}
	}
	encoded, err := json.Marshal(headers)
	if err != nil {
		return err
	}
	record.Set("headers", string(encoded))
	return nil
}

// toResponse mirrors the record fields the browser may see. Stored headers are
// deliberately absent: they are write-only for the whole feature.
func toResponse(record *core.Record) map[string]any {
	server, err := decodeServer(record)
	tools := []ToolDefinition{}
	if err == nil {
		tools = server.Tools
	}
	headerNames := []string{}
	for name := range server.Headers {
		headerNames = append(headerNames, name)
	}
	return map[string]any{
		"id":             record.Id,
		"name":           record.GetString("name"),
		"slug":           record.GetString("slug"),
		"transport":      record.GetString("transport"),
		"url":            record.GetString("url"),
		"approvalPolicy": record.GetString("approval_policy"),
		"enabled":        record.GetBool("enabled"),
		"tools":          tools,
		"headerNames":    headerNames,
		"lastError":      record.GetString("last_error"),
		"lastRefreshed":  record.GetDateTime("last_refreshed"),
		"created":        record.GetDateTime("created"),
	}
}
