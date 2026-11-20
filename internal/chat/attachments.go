package chat

import (
	"errors"
	"strings"

	"github.com/pocketbase/pocketbase/core"
	workagent "github.com/xusenlin/workavera/internal/agent"
	"github.com/xusenlin/workavera/internal/resources"
)

// maxMessageResources bounds the request and the input layout. Only short
// descriptions of the resources enter the model context, so it is not a
// context budget.
const maxMessageResources = 6

var (
	errEmptyUserMessage     = errors.New("a user message needs text or an attached resource")
	errTooManyResources     = errors.New("a message can attach at most 6 resources")
	errInvalidResourceParts = errors.New("each attached resource must be named once by its resourceId")
)

// submittedUserMessage is what the server keeps from a client submission:
// non-empty text parts and the referenced resource IDs. Anything else the
// client sent, including resource names, types, and sizes, is discarded.
type submittedUserMessage struct {
	texts       []workagent.Part
	resourceIDs []string
}

func parseUserParts(parts []workagent.Part) (submittedUserMessage, error) {
	var message submittedUserMessage
	seen := map[string]bool{}
	for _, part := range parts {
		switch part["type"] {
		case "text":
			if text, _ := part["text"].(string); strings.TrimSpace(text) != "" {
				message.texts = append(message.texts, workagent.Part{"type": "text", "text": text})
			}
		case "data-resource":
			data, _ := part["data"].(map[string]any)
			resourceID, _ := data["resourceId"].(string)
			resourceID = strings.TrimSpace(resourceID)
			if resourceID == "" || seen[resourceID] {
				return submittedUserMessage{}, errInvalidResourceParts
			}
			seen[resourceID] = true
			message.resourceIDs = append(message.resourceIDs, resourceID)
		}
	}
	if len(message.resourceIDs) > maxMessageResources {
		return submittedUserMessage{}, errTooManyResources
	}
	if len(message.texts) == 0 && len(message.resourceIDs) == 0 {
		return submittedUserMessage{}, errEmptyUserMessage
	}
	return message, nil
}

// canonicalParts rebuilds the message from the owner's current resource
// records, in a fixed order: every resource first, then the text. It fails if
// any referenced resource is missing or belongs to someone else.
func (m submittedUserMessage) canonicalParts(app core.App, ownerID string) ([]workagent.Part, error) {
	snapshots, err := resources.Snapshots(app, ownerID, m.resourceIDs)
	if err != nil {
		return nil, err
	}
	parts := make([]workagent.Part, 0, len(snapshots)+len(m.texts))
	for _, snapshot := range snapshots {
		data := map[string]any{
			"resourceId": snapshot.ResourceID,
			"name":       snapshot.Name,
			"mediaType":  snapshot.MediaType,
			"size":       snapshot.Size,
		}
		parts = append(parts, workagent.Part{"type": "data-resource", "id": snapshot.ResourceID, "data": data})
	}
	return append(parts, m.texts...), nil
}
