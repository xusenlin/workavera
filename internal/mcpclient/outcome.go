package mcpclient

import (
	"context"
	"errors"
	"strings"

	"github.com/modelcontextprotocol/go-sdk/jsonrpc"
)

// outcome classifies a failed call so the interface can tell the user what to
// actually do about it. The two failures that matter most look alike from the
// assistant's side but need opposite actions: an expired credential needs
// re-authentication, a drifted definition needs a refresh.
type outcome int

const (
	// outcomeUpstream is the upstream server's own fault or an ordinary
	// failure. Nothing about the configuration is wrong.
	outcomeUpstream outcome = iota
	// outcomeStale means the locked definition no longer matches upstream.
	outcomeStale
	// outcomeUnreachable means the server could not be contacted or refused
	// the credentials.
	outcomeUnreachable
)

// staleMarkers are substrings servers use when a named tool does not exist.
// The spec does not mandate a channel for this condition — implementations
// variously use an error code, an isError result, or a plain internal error —
// so name matching is the only signal available.
var staleMarkers = []string{
	"unknown tool",
	"tool not found",
	"no such tool",
	"unknown tool name",
}

// classifyCallError maps a failed tools/call to an outcome.
//
// validationPassed reports whether the arguments satisfied the locked schema.
// It is what makes an invalid-params rejection meaningful: if the arguments
// provably matched what the model was shown, then upstream and the locked
// definition disagree.
func classifyCallError(err error, validationPassed bool) outcome {
	if err == nil {
		return outcomeUpstream
	}
	if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
		return outcomeUnreachable
	}

	var wireError *jsonrpc.Error
	if !errors.As(err, &wireError) {
		// No JSON-RPC response at all: transport, TLS, DNS, or an HTTP status
		// the transport rejected before a message was parsed.
		return outcomeUnreachable
	}

	message := strings.ToLower(wireError.Message)
	for _, marker := range staleMarkers {
		if strings.Contains(message, marker) {
			return outcomeStale
		}
	}
	if wireError.Code == jsonrpc.CodeInvalidParams && validationPassed {
		return outcomeStale
	}
	if wireError.Code == jsonrpc.CodeMethodNotFound {
		// The server does not serve tools/call at all, which is a server-level
		// problem rather than one tool being out of date.
		return outcomeUnreachable
	}
	return outcomeUpstream
}

// classifyConnectError describes why a handshake failed. Every handshake
// failure is server-level: no individual tool can be blamed for it.
func classifyConnectError(err error) string {
	if errors.Is(err, context.DeadlineExceeded) {
		return "The server did not respond in time."
	}
	if errors.Is(err, context.Canceled) {
		return "The connection was cancelled."
	}
	message := err.Error()
	lower := strings.ToLower(message)
	switch {
	case strings.Contains(lower, "401"), strings.Contains(lower, "unauthorized"):
		return "The server rejected the configured credentials."
	case strings.Contains(lower, "403"), strings.Contains(lower, "forbidden"):
		return "The server refused access with the configured credentials."
	case strings.Contains(lower, "404"):
		return "The server returned 404 for this endpoint. Check the URL."
	case strings.Contains(lower, "405"), strings.Contains(lower, "method not allowed"):
		// Almost always a transport mismatch: a legacy SSE endpoint only
		// accepts GET, so posting the handshake to it returns 405. Naming the
		// likely fix saves the user from debugging a bare status code.
		return "The endpoint rejected the request method. This usually means the transport " +
			"does not match the URL: use SSE for a /sse endpoint, or Streamable HTTP for a /mcp endpoint."
	case strings.Contains(lower, "410"), strings.Contains(lower, "gone"):
		// The MCP ecosystem is retiring the 2024-11-05 SSE transport, and
		// servers commonly answer a retired /sse endpoint with 410. The SDK
		// discards the response body, so the explanation the server sent is
		// not available to pass along.
		return "The server has permanently retired this endpoint. If the URL ends in /sse, " +
			"the server has most likely dropped the legacy SSE transport: switch to its " +
			"Streamable HTTP endpoint, usually /mcp."
	}
	if len(message) > 200 {
		message = message[:200]
	}
	return message
}
