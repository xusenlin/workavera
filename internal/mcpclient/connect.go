package mcpclient

import (
	"context"
	"net/http"
	"time"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

const (
	// connectTimeout bounds the MCP handshake, and callTimeout bounds a whole
	// tool call, so a stalled upstream cannot hold a Chat run open until the
	// run deadline.
	connectTimeout = 15 * time.Second
	callTimeout    = 60 * time.Second
	refreshTimeout = 30 * time.Second
)

// headerTransport attaches the owner's stored credentials to every upstream
// request.
type headerTransport struct {
	headers map[string]string
	base    http.RoundTripper
}

func (t headerTransport) RoundTrip(request *http.Request) (*http.Response, error) {
	// The request must not be mutated in place; RoundTrippers receive a
	// request the caller still owns.
	clone := request.Clone(request.Context())
	for name, value := range t.headers {
		clone.Header.Set(name, value)
	}
	base := t.base
	if base == nil {
		base = http.DefaultTransport
	}
	return base.RoundTrip(clone)
}

// connect opens a session that lives only as long as the caller's use of it.
// There is no pool: the handshake happens inside the tool-execution window,
// where it is negligible next to model latency, and in exchange there is no
// connection lifecycle, no idle reaping, and no shared state to race on.
func connect(ctx context.Context, server Server, version string) (*mcp.ClientSession, error) {
	httpClient := &http.Client{
		Transport: headerTransport{headers: server.Headers},
		Timeout:   callTimeout,
	}

	var transport mcp.Transport
	if server.Transport == "sse" {
		transport = &mcp.SSEClientTransport{Endpoint: server.URL, HTTPClient: httpClient}
	} else {
		transport = &mcp.StreamableClientTransport{
			Endpoint:   server.URL,
			HTTPClient: httpClient,
			// Nothing here consumes server-initiated messages: tool
			// definitions change only through a refresh the user accepts, so
			// tools/list_changed has nothing to act on. Skipping the stream
			// avoids a second connection and its reconnect machinery.
			DisableStandaloneSSE: true,
			// A connection serves exactly one call; retrying a handshake would
			// only delay the error the assistant needs to see.
			MaxRetries: -1,
		}
	}

	client := mcp.NewClient(&mcp.Implementation{
		Name:    "workavera",
		Title:   "Workavera",
		Version: version,
	}, nil)

	handshakeCtx, cancel := context.WithTimeout(ctx, connectTimeout)
	defer cancel()
	return client.Connect(handshakeCtx, transport, nil)
}
