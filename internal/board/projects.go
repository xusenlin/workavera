package board

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/pocketbase/pocketbase/core"
)

type createBoardProjectRequest struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	TemplateID  string `json:"templateId"`
}

type boardTemplateState struct {
	Name     string `json:"name"`
	Color    string `json:"color"`
	Category string `json:"category"`
}

type boardTemplateLabel struct {
	Name  string `json:"name"`
	Color string `json:"color"`
}

func createBoardProject(event *core.RequestEvent) error {
	var request createBoardProjectRequest
	if err := event.BindBody(&request); err != nil {
		return event.BadRequestError("Invalid project data.", err)
	}

	request.Name = strings.TrimSpace(request.Name)
	request.Description = strings.TrimSpace(request.Description)
	if request.Name == "" {
		return event.BadRequestError("Project name is required.", nil)
	}

	var projectID string
	err := event.App.RunInTransaction(func(txApp core.App) error {
		projects, err := txApp.FindCollectionByNameOrId(boardProjectsCollection)
		if err != nil {
			return err
		}

		project := core.NewRecord(projects)
		project.Set("name", request.Name)
		project.Set("description", request.Description)
		project.Set("owner", event.Auth.Id)
		project.Set("archived", false)
		if err := txApp.Save(project); err != nil {
			return err
		}
		projectID = project.Id

		members, err := txApp.FindCollectionByNameOrId(boardProjectMembersCollection)
		if err != nil {
			return err
		}
		member := core.NewRecord(members)
		member.Set("project", project.Id)
		member.Set("user", event.Auth.Id)
		member.Set("role", "owner")
		if err := txApp.Save(member); err != nil {
			return err
		}

		if request.TemplateID == "" {
			return nil
		}

		template, err := txApp.FindRecordById(boardTemplatesCollection, request.TemplateID)
		if err != nil {
			return err
		}
		owner := template.GetString("owner")
		if owner != "" && owner != event.Auth.Id {
			return event.ForbiddenError("You cannot use this template.", nil)
		}

		var templateStates []boardTemplateState
		if err := decodeBoardTemplateField(template.Get("states"), &templateStates); err != nil {
			return err
		}
		states, err := txApp.FindCollectionByNameOrId(boardProjectStatesCollection)
		if err != nil {
			return err
		}
		for index, state := range templateStates {
			record := core.NewRecord(states)
			record.Set("project", project.Id)
			record.Set("name", strings.TrimSpace(state.Name))
			record.Set("color", state.Color)
			record.Set("category", state.Category)
			record.Set("sort_order", (index+1)*1024)
			if err := txApp.Save(record); err != nil {
				return err
			}
		}

		var templateLabels []boardTemplateLabel
		if err := decodeBoardTemplateField(template.Get("labels"), &templateLabels); err != nil {
			return err
		}
		labels, err := txApp.FindCollectionByNameOrId(boardProjectLabelsCollection)
		if err != nil {
			return err
		}
		for _, label := range templateLabels {
			record := core.NewRecord(labels)
			record.Set("project", project.Id)
			record.Set("name", strings.TrimSpace(label.Name))
			record.Set("color", label.Color)
			if err := txApp.Save(record); err != nil {
				return err
			}
		}

		return nil
	})
	if err != nil {
		return event.BadRequestError("Could not create project.", err)
	}

	project, err := event.App.FindRecordById(boardProjectsCollection, projectID)
	if err != nil {
		return event.InternalServerError("Project was created but could not be loaded.", err)
	}
	return event.JSON(http.StatusCreated, project)
}

func decodeBoardTemplateField(value any, target any) error {
	raw, err := json.Marshal(value)
	if err != nil {
		return err
	}
	return json.Unmarshal(raw, target)
}
