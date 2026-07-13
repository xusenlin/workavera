package llm

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strings"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/types"

	"github.com/xusenlin/workavera/internal/notifications"
)

var supportedProtocols = map[string]struct{}{
	"openai":            {},
	"openai-compatible": {},
	"anthropic":         {},
	"google":            {},
}

type modelResponse struct {
	ID              string `json:"id"`
	Name            string `json:"name"`
	ModelID         string `json:"modelId"`
	BaseURL         string `json:"baseUrl"`
	Protocol        string `json:"protocol"`
	MaxOutputTokens int    `json:"maxOutputTokens"`
	IsDefault       bool   `json:"isDefault"`
	SharedFrom      string `json:"sharedFrom"`
	SharedFromName  string `json:"sharedFromName"`
	HasAPIKey       bool   `json:"hasApiKey"`
	Created         string `json:"created"`
	Updated         string `json:"updated"`
}

type createModelRequest struct {
	Name            string `json:"name"`
	ModelID         string `json:"modelId"`
	BaseURL         string `json:"baseUrl"`
	APIKey          string `json:"apiKey"`
	Protocol        string `json:"protocol"`
	MaxOutputTokens *int   `json:"maxOutputTokens"`
}

type updateModelRequest struct {
	Name            *string `json:"name"`
	ModelID         *string `json:"modelId"`
	BaseURL         *string `json:"baseUrl"`
	APIKey          *string `json:"apiKey"`
	Protocol        *string `json:"protocol"`
	MaxOutputTokens *int    `json:"maxOutputTokens"`
}

type shareTargetResponse struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

type shareModelRequest struct {
	UserIDs []string `json:"userIds"`
}

type shareModelResponse struct {
	Shared int `json:"shared"`
}

type respondToShareRequest struct {
	Decision string `json:"decision"`
}

func listModels(event *core.RequestEvent) error {
	records, err := event.App.FindRecordsByFilter(
		modelsCollection,
		"owner = {:owner}",
		"created",
		0,
		0,
		dbx.Params{"owner": event.Auth.Id},
	)
	if err != nil {
		return event.InternalServerError("Could not load model configurations.", err)
	}

	// Batch-load the shared_from author for the whole page in one query.
	event.App.ExpandRecords(records, []string{"shared_from"}, nil)
	result := make([]modelResponse, 0, len(records))
	for _, record := range records {
		result = append(result, toModelResponse(record))
	}
	return event.JSON(http.StatusOK, result)
}

func createModel(event *core.RequestEvent) error {
	var request createModelRequest
	if err := event.BindBody(&request); err != nil {
		return event.BadRequestError("Invalid model configuration.", err)
	}
	request.Name = strings.TrimSpace(request.Name)
	request.ModelID = strings.TrimSpace(request.ModelID)
	request.BaseURL = strings.TrimSpace(request.BaseURL)
	request.APIKey = strings.TrimSpace(request.APIKey)
	request.Protocol = strings.TrimSpace(request.Protocol)
	if err := validateModel(request.Name, request.ModelID, request.BaseURL, request.Protocol); err != nil {
		return event.BadRequestError(err.Error(), nil)
	}
	maxOutputTokens, err := validateMaxOutputTokens(request.MaxOutputTokens)
	if err != nil {
		return event.BadRequestError(err.Error(), nil)
	}

	var createdID string
	err = event.App.RunInTransaction(func(txApp core.App) error {
		collection, err := txApp.FindCollectionByNameOrId(modelsCollection)
		if err != nil {
			return err
		}
		existing, err := txApp.FindRecordsByFilter(
			modelsCollection,
			"owner = {:owner}",
			"",
			1,
			0,
			dbx.Params{"owner": event.Auth.Id},
		)
		if err != nil {
			return err
		}

		record := core.NewRecord(collection)
		record.Set("owner", event.Auth.Id)
		record.Set("name", request.Name)
		record.Set("model_id", request.ModelID)
		record.Set("base_url", request.BaseURL)
		record.Set("api_key", request.APIKey)
		record.Set("protocol", request.Protocol)
		record.Set("max_output_tokens", maxOutputTokens)
		record.Set("is_default", len(existing) == 0)
		if err := txApp.Save(record); err != nil {
			return err
		}
		createdID = record.Id
		return nil
	})
	if err != nil {
		return event.BadRequestError("Could not create model configuration.", err)
	}

	record, err := event.App.FindRecordById(modelsCollection, createdID)
	if err != nil {
		return event.InternalServerError("Model configuration was created but could not be loaded.", err)
	}
	return event.JSON(http.StatusCreated, modelResponseFor(event.App, record))
}

func updateModel(event *core.RequestEvent) error {
	record, err := findOwnedModel(event.App, event.Request.PathValue("id"), event.Auth.Id)
	if err != nil {
		return event.NotFoundError("Model configuration not found.", err)
	}

	var request updateModelRequest
	if err := event.BindBody(&request); err != nil {
		return event.BadRequestError("Invalid model configuration.", err)
	}

	name := record.GetString("name")
	modelID := record.GetString("model_id")
	baseURL := record.GetString("base_url")
	protocol := record.GetString("protocol")
	if request.Name != nil {
		name = strings.TrimSpace(*request.Name)
	}
	if request.ModelID != nil {
		modelID = strings.TrimSpace(*request.ModelID)
	}
	if request.BaseURL != nil {
		baseURL = strings.TrimSpace(*request.BaseURL)
	}
	if request.Protocol != nil {
		protocol = strings.TrimSpace(*request.Protocol)
	}
	if err := validateModel(name, modelID, baseURL, protocol); err != nil {
		return event.BadRequestError(err.Error(), nil)
	}

	maxOutputTokens := int(record.GetInt("max_output_tokens"))
	if request.MaxOutputTokens != nil {
		maxOutputTokens, err = validateMaxOutputTokens(request.MaxOutputTokens)
		if err != nil {
			return event.BadRequestError(err.Error(), nil)
		}
	}

	record.Set("name", name)
	record.Set("model_id", modelID)
	record.Set("base_url", baseURL)
	record.Set("protocol", protocol)
	record.Set("max_output_tokens", maxOutputTokens)
	if request.APIKey != nil {
		record.Set("api_key", strings.TrimSpace(*request.APIKey))
	}
	if err := event.App.Save(record); err != nil {
		return event.BadRequestError("Could not update model configuration.", err)
	}
	return event.JSON(http.StatusOK, modelResponseFor(event.App, record))
}

func deleteModel(event *core.RequestEvent) error {
	id := event.Request.PathValue("id")
	ownerID := event.Auth.Id
	_, err := findOwnedModel(event.App, id, ownerID)
	if err != nil {
		return event.NotFoundError("Model configuration not found.", err)
	}
	err = event.App.RunInTransaction(func(txApp core.App) error {
		target, err := findOwnedModel(txApp, id, ownerID)
		if err != nil {
			return err
		}
		wasDefault := target.GetBool("is_default")
		if err := txApp.Delete(target); err != nil {
			return err
		}
		if !wasDefault {
			return nil
		}
		remaining, err := txApp.FindRecordsByFilter(
			modelsCollection,
			"owner = {:owner}",
			"created,id",
			1,
			0,
			dbx.Params{"owner": ownerID},
		)
		if err != nil {
			return err
		}
		if len(remaining) == 1 {
			remaining[0].Set("is_default", true)
			return txApp.Save(remaining[0])
		}
		return nil
	})
	if err != nil {
		return event.BadRequestError("Could not delete model configuration.", err)
	}
	return event.NoContent(http.StatusNoContent)
}

func setDefaultModel(event *core.RequestEvent) error {
	id := event.Request.PathValue("id")
	ownerID := event.Auth.Id
	if _, err := findOwnedModel(event.App, id, ownerID); err != nil {
		return event.NotFoundError("Model configuration not found.", err)
	}

	err := event.App.RunInTransaction(func(txApp core.App) error {
		target, err := findOwnedModel(txApp, id, ownerID)
		if err != nil {
			return err
		}
		records, err := txApp.FindRecordsByFilter(
			modelsCollection,
			"owner = {:owner}",
			"",
			0,
			0,
			dbx.Params{"owner": ownerID},
		)
		if err != nil {
			return err
		}
		for _, record := range records {
			shouldBeDefault := record.Id == target.Id
			if record.GetBool("is_default") == shouldBeDefault {
				continue
			}
			record.Set("is_default", shouldBeDefault)
			if err := txApp.Save(record); err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		return event.BadRequestError("Could not set the default model.", err)
	}

	record, err := event.App.FindRecordById(modelsCollection, id)
	if err != nil {
		return event.InternalServerError("Default model was updated but could not be loaded.", err)
	}
	return event.JSON(http.StatusOK, modelResponseFor(event.App, record))
}

func listShareTargets(event *core.RequestEvent) error {
	records, err := event.App.FindRecordsByFilter(
		"users",
		"id != {:current}",
		"name,id",
		0,
		0,
		dbx.Params{"current": event.Auth.Id},
	)
	if err != nil {
		return event.InternalServerError("Could not load users.", err)
	}

	result := make([]shareTargetResponse, 0, len(records))
	for _, record := range records {
		name := strings.TrimSpace(record.GetString("name"))
		if name == "" {
			name = "User " + record.Id[len(record.Id)-6:]
		}
		result = append(result, shareTargetResponse{ID: record.Id, Name: name})
	}
	return event.JSON(http.StatusOK, result)
}

func shareModel(event *core.RequestEvent) error {
	sourceID := event.Request.PathValue("id")
	source, err := findOwnedModel(event.App, sourceID, event.Auth.Id)
	if err != nil {
		return event.NotFoundError("Model configuration not found.", err)
	}
	if source.GetString("shared_from") != "" {
		return apis.NewApiError(http.StatusForbidden, "This configuration was shared with you and cannot be shared onward. Only the original author can share it.", nil)
	}

	var request shareModelRequest
	if err := event.BindBody(&request); err != nil {
		return event.BadRequestError("Invalid recipients.", err)
	}
	userIDs := uniqueNonEmptyStrings(request.UserIDs)
	if len(userIDs) == 0 {
		return event.BadRequestError("Select at least one user.", nil)
	}
	if len(userIDs) > 100 {
		return event.BadRequestError("You can share a configuration with at most 100 users at once.", nil)
	}

	err = event.App.RunInTransaction(func(txApp core.App) error {
		source, err := findOwnedModel(txApp, sourceID, event.Auth.Id)
		if err != nil {
			return err
		}
		if err := validateShareRecipients(txApp, userIDs, event.Auth.Id); err != nil {
			return err
		}
		senderName := strings.TrimSpace(event.Auth.GetString("name"))
		if senderName == "" {
			senderName = "A Workavera user"
		}
		for _, userID := range userIDs {
			dedupeKey := "model-share:" + event.Auth.Id + ":" + userID + ":" + sourceID
			input := notifications.CreateInput{
				RecipientID: userID,
				Type:        "model_share",
				Title:       senderName + " shared a model configuration",
				Body:        "Review and choose whether to add “" + source.GetString("name") + "” to your account.",
				Data: map[string]any{
					"senderId": event.Auth.Id, "sourceModelId": sourceID, "senderName": senderName, "modelName": source.GetString("name"), "shareStatus": "pending",
				},
				DedupeKey: dedupeKey,
			}
			if _, created, err := notifications.Create(event.Request.Context(), txApp, input); err != nil {
				return err
			} else if !created {
				if _, err := notifications.Update(event.Request.Context(), txApp, dedupeKey, input); err != nil {
					return err
				}
			}
		}
		return nil
	})
	if err != nil {
		return event.BadRequestError("Could not share model configuration.", err)
	}
	return event.JSON(http.StatusCreated, shareModelResponse{Shared: len(userIDs)})
}

func validateShareRecipients(app core.App, userIDs []string, senderID string) error {
	clauses := make([]string, 0, len(userIDs))
	params := make(dbx.Params, len(userIDs))
	for index, userID := range userIDs {
		if userID == senderID {
			return errors.New("cannot share a configuration with yourself")
		}
		key := fmt.Sprintf("recipient%d", index)
		clauses = append(clauses, "id = {:"+key+"}")
		params[key] = userID
	}
	records, err := app.FindRecordsByFilter("users", "("+strings.Join(clauses, " || ")+")", "", 0, 0, params)
	if err != nil || len(records) != len(userIDs) {
		return errors.New("one or more selected users no longer exist")
	}
	return nil
}

func respondToShare(event *core.RequestEvent) error {
	var request respondToShareRequest
	if err := event.BindBody(&request); err != nil {
		return event.BadRequestError("Invalid response.", err)
	}
	request.Decision = strings.TrimSpace(request.Decision)
	if request.Decision != "accept" && request.Decision != "reject" {
		return event.BadRequestError("Decision must be accept or reject.", nil)
	}
	notificationID := event.Request.PathValue("id")
	var model modelResponse
	status := "rejected"
	err := event.App.RunInTransaction(func(txApp core.App) error {
		notification, err := txApp.FindFirstRecordByFilter(notifications.CollectionName, "id = {:id} && recipient = {:recipient} && type = 'model_share'", dbx.Params{"id": notificationID, "recipient": event.Auth.Id})
		if err != nil {
			return err
		}
		data := map[string]any{}
		if err := json.Unmarshal([]byte(notification.GetString("data")), &data); err != nil {
			return errors.New("invalid share invitation")
		}
		current, _ := data["shareStatus"].(string)
		if current == "" {
			current = "pending"
		}
		requested := request.Decision + "ed"
		if request.Decision == "accept" {
			requested = "accepted"
		}
		if current != "pending" {
			if current == requested {
				status = current
				if id, _ := data["acceptedModelId"].(string); id != "" {
					if record, findErr := txApp.FindRecordById(modelsCollection, id); findErr == nil {
						model = modelResponseFor(txApp, record)
					}
				}
				return nil
			}
			return errors.New("share invitation has already been resolved")
		}
		if request.Decision == "accept" {
			senderID, _ := data["senderId"].(string)
			sourceModelID, _ := data["sourceModelId"].(string)
			source, err := findOwnedModel(txApp, sourceModelID, senderID)
			if err != nil {
				return errors.New("the shared model configuration no longer exists")
			}
			collection, err := txApp.FindCollectionByNameOrId(modelsCollection)
			if err != nil {
				return err
			}
			existing, err := txApp.FindRecordsByFilter(modelsCollection, "owner = {:owner}", "", 1, 0, dbx.Params{"owner": event.Auth.Id})
			if err != nil {
				return err
			}
			record := core.NewRecord(collection)
			record.Set("owner", event.Auth.Id)
			record.Set("name", source.GetString("name"))
			record.Set("model_id", source.GetString("model_id"))
			record.Set("base_url", source.GetString("base_url"))
			record.Set("api_key", source.GetString("api_key"))
			record.Set("protocol", source.GetString("protocol"))
			record.Set("max_output_tokens", source.GetInt("max_output_tokens"))
			record.Set("is_default", len(existing) == 0)
			// Record the author this copy came from: marks it as a received
			// copy (blocks onward sharing) and keeps the source traceable.
			record.Set("shared_from", senderID)
			if err := txApp.Save(record); err != nil {
				return err
			}
			data["acceptedModelId"] = record.Id
			model = modelResponseFor(txApp, record)
			status = "accepted"
		}
		data["shareStatus"] = status
		notification.Set("data", data)
		notification.Set("read_at", types.NowDateTime())
		if err := txApp.Save(notification); err != nil {
			return err
		}
		return nil
	})
	if err != nil {
		if strings.Contains(err.Error(), "already been resolved") {
			return apis.NewApiError(http.StatusConflict, "Share invitation has already been resolved.", err)
		}
		if strings.Contains(err.Error(), "no longer exists") {
			return event.BadRequestError("The shared model configuration no longer exists.", nil)
		}
		return event.BadRequestError("Could not respond to share invitation.", err)
	}
	return event.JSON(http.StatusOK, map[string]any{"status": status, "model": model})
}

func findOwnedModel(app core.App, id, ownerID string) (*core.Record, error) {
	if id == "" {
		return nil, errors.New("missing model id")
	}
	return app.FindFirstRecordByFilter(
		modelsCollection,
		"id = {:id} && owner = {:owner}",
		dbx.Params{"id": id, "owner": ownerID},
	)
}

func validateModel(name, modelID, baseURL, protocol string) error {
	if name == "" {
		return errors.New("Model name is required.")
	}
	if modelID == "" {
		return errors.New("Model ID is required.")
	}
	if _, ok := supportedProtocols[protocol]; !ok {
		return errors.New("Protocol must be openai, openai-compatible, anthropic, or google.")
	}
	parsed, err := url.ParseRequestURI(baseURL)
	if err != nil || parsed.Host == "" || (parsed.Scheme != "http" && parsed.Scheme != "https") {
		return errors.New("Base URL must be an absolute HTTP or HTTPS URL.")
	}
	return nil
}

// validateMaxOutputTokens normalizes an optional max output tokens request
// value. A nil value (omitted) resolves to zero so the model keeps the default
// limit; zero and negative values are also treated as "use the default".
func validateMaxOutputTokens(value *int) (int, error) {
	if value == nil || *value <= 0 {
		return 0, nil
	}
	return *value, nil
}

func uniqueNonEmptyStrings(values []string) []string {
	seen := make(map[string]struct{}, len(values))
	result := make([]string, 0, len(values))
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value == "" {
			continue
		}
		if _, exists := seen[value]; exists {
			continue
		}
		seen[value] = struct{}{}
		result = append(result, value)
	}
	return result
}

// toModelResponse builds the API payload for a record. The shared_from author
// name is read from the expanded relation, so callers must expand "shared_from"
// beforehand (via modelResponseFor for a single record, or ExpandRecords for a
// list); an unexpanded or since-deleted author yields an empty name.
func toModelResponse(record *core.Record) modelResponse {
	sharedFromName := ""
	if author := record.ExpandedOne("shared_from"); author != nil {
		sharedFromName = strings.TrimSpace(author.GetString("name"))
	}
	return modelResponse{
		ID:              record.Id,
		Name:            record.GetString("name"),
		ModelID:         record.GetString("model_id"),
		BaseURL:         record.GetString("base_url"),
		Protocol:        record.GetString("protocol"),
		MaxOutputTokens: int(record.GetInt("max_output_tokens")),
		IsDefault:       record.GetBool("is_default"),
		SharedFrom:      record.GetString("shared_from"),
		SharedFromName:  sharedFromName,
		HasAPIKey:       record.GetString("api_key") != "",
		Created:         record.GetDateTime("created").String(),
		Updated:         record.GetDateTime("updated").String(),
	}
}

// modelResponseFor expands the shared_from author for a single record and builds
// its response. Expansion is a no-op for owner-created models (empty relation).
func modelResponseFor(app core.App, record *core.Record) modelResponse {
	app.ExpandRecord(record, []string{"shared_from"}, nil)
	return toModelResponse(record)
}
