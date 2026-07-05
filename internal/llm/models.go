package llm

import (
	"errors"
	"net/http"
	"net/url"
	"strings"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

var supportedProtocols = map[string]struct{}{
	"openai":    {},
	"anthropic": {},
	"google":    {},
}

type modelResponse struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	ModelID   string `json:"modelId"`
	BaseURL   string `json:"baseUrl"`
	Protocol  string `json:"protocol"`
	IsDefault bool   `json:"isDefault"`
	HasAPIKey bool   `json:"hasApiKey"`
	Created   string `json:"created"`
	Updated   string `json:"updated"`
}

type createModelRequest struct {
	Name     string `json:"name"`
	ModelID  string `json:"modelId"`
	BaseURL  string `json:"baseUrl"`
	APIKey   string `json:"apiKey"`
	Protocol string `json:"protocol"`
}

type updateModelRequest struct {
	Name     *string `json:"name"`
	ModelID  *string `json:"modelId"`
	BaseURL  *string `json:"baseUrl"`
	APIKey   *string `json:"apiKey"`
	Protocol *string `json:"protocol"`
}

type shareTargetResponse struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

type copyModelRequest struct {
	UserIDs []string `json:"userIds"`
}

type copyModelResponse struct {
	Copied int `json:"copied"`
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

	var createdID string
	err := event.App.RunInTransaction(func(txApp core.App) error {
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
	return event.JSON(http.StatusCreated, toModelResponse(record))
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

	record.Set("name", name)
	record.Set("model_id", modelID)
	record.Set("base_url", baseURL)
	record.Set("protocol", protocol)
	if request.APIKey != nil {
		record.Set("api_key", strings.TrimSpace(*request.APIKey))
	}
	if err := event.App.Save(record); err != nil {
		return event.BadRequestError("Could not update model configuration.", err)
	}
	return event.JSON(http.StatusOK, toModelResponse(record))
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
	return event.JSON(http.StatusOK, toModelResponse(record))
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

func copyModel(event *core.RequestEvent) error {
	sourceID := event.Request.PathValue("id")
	if _, err := findOwnedModel(event.App, sourceID, event.Auth.Id); err != nil {
		return event.NotFoundError("Model configuration not found.", err)
	}

	var request copyModelRequest
	if err := event.BindBody(&request); err != nil {
		return event.BadRequestError("Invalid recipients.", err)
	}
	userIDs := uniqueNonEmptyStrings(request.UserIDs)
	if len(userIDs) == 0 {
		return event.BadRequestError("Select at least one user.", nil)
	}
	if len(userIDs) > 100 {
		return event.BadRequestError("You can copy a configuration to at most 100 users at once.", nil)
	}

	err := event.App.RunInTransaction(func(txApp core.App) error {
		source, err := findOwnedModel(txApp, sourceID, event.Auth.Id)
		if err != nil {
			return err
		}
		collection, err := txApp.FindCollectionByNameOrId(modelsCollection)
		if err != nil {
			return err
		}
		for _, userID := range userIDs {
			if userID == event.Auth.Id {
				return errors.New("cannot copy a configuration to yourself")
			}
			user, err := txApp.FindRecordById("users", userID)
			if err != nil || user.Collection().Name != "users" {
				return errors.New("one or more selected users no longer exist")
			}
			existing, err := txApp.FindRecordsByFilter(
				modelsCollection,
				"owner = {:owner}",
				"",
				1,
				0,
				dbx.Params{"owner": userID},
			)
			if err != nil {
				return err
			}

			copy := core.NewRecord(collection)
			copy.Set("owner", userID)
			copy.Set("name", source.GetString("name"))
			copy.Set("model_id", source.GetString("model_id"))
			copy.Set("base_url", source.GetString("base_url"))
			copy.Set("api_key", source.GetString("api_key"))
			copy.Set("protocol", source.GetString("protocol"))
			copy.Set("is_default", len(existing) == 0)
			if err := txApp.Save(copy); err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		return event.BadRequestError("Could not copy model configuration.", err)
	}
	return event.JSON(http.StatusCreated, copyModelResponse{Copied: len(userIDs)})
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
		return errors.New("Protocol must be openai, anthropic, or google.")
	}
	parsed, err := url.ParseRequestURI(baseURL)
	if err != nil || parsed.Host == "" || (parsed.Scheme != "http" && parsed.Scheme != "https") {
		return errors.New("Base URL must be an absolute HTTP or HTTPS URL.")
	}
	return nil
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

func toModelResponse(record *core.Record) modelResponse {
	return modelResponse{
		ID:        record.Id,
		Name:      record.GetString("name"),
		ModelID:   record.GetString("model_id"),
		BaseURL:   record.GetString("base_url"),
		Protocol:  record.GetString("protocol"),
		IsDefault: record.GetBool("is_default"),
		HasAPIKey: record.GetString("api_key") != "",
		Created:   record.GetDateTime("created").String(),
		Updated:   record.GetDateTime("updated").String(),
	}
}
