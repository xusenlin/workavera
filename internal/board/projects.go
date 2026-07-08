package board

import (
	"net/http"
	"strings"

	"github.com/pocketbase/pocketbase/core"
)

type boardProjectStateInput struct {
	Name     string `json:"name"`
	Color    string `json:"color"`
	Category string `json:"category"`
}

type boardProjectLabelInput struct {
	Name  string `json:"name"`
	Color string `json:"color"`
}

type boardProjectMemberInput struct {
	UserID string `json:"userId"`
	Role   string `json:"role"`
}

type createBoardProjectRequest struct {
	Name        string                    `json:"name"`
	Description string                    `json:"description"`
	States      []boardProjectStateInput  `json:"states"`
	Labels      []boardProjectLabelInput  `json:"labels"`
	Members     []boardProjectMemberInput `json:"members"`
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

		membersCollection, err := txApp.FindCollectionByNameOrId(boardProjectMembersCollection)
		if err != nil {
			return err
		}

		// Always create an owner membership for the creator.
		ownerMember := core.NewRecord(membersCollection)
		ownerMember.Set("project", project.Id)
		ownerMember.Set("user", event.Auth.Id)
		ownerMember.Set("role", "owner")
		if err := txApp.Save(ownerMember); err != nil {
			return err
		}

		// Create additional members (skip the owner to avoid duplicates).
		for _, m := range request.Members {
			if m.UserID == "" || m.UserID == event.Auth.Id {
				continue
			}
			role := m.Role
			if role == "" || role == "owner" {
				role = "member"
			}
			record := core.NewRecord(membersCollection)
			record.Set("project", project.Id)
			record.Set("user", m.UserID)
			record.Set("role", role)
			if err := txApp.Save(record); err != nil {
				return err
			}
		}

		// Create states.
		if len(request.States) > 0 {
			statesCollection, err := txApp.FindCollectionByNameOrId(boardProjectStatesCollection)
			if err != nil {
				return err
			}
			for index, state := range request.States {
				name := strings.TrimSpace(state.Name)
				if name == "" {
					continue
				}
				record := core.NewRecord(statesCollection)
				record.Set("project", project.Id)
				record.Set("name", name)
				record.Set("color", state.Color)
				record.Set("category", state.Category)
				record.Set("sort_order", (index+1)*1024)
				if err := txApp.Save(record); err != nil {
					return err
				}
			}
		}

		// Create labels.
		if len(request.Labels) > 0 {
			labelsCollection, err := txApp.FindCollectionByNameOrId(boardProjectLabelsCollection)
			if err != nil {
				return err
			}
			for _, label := range request.Labels {
				name := strings.TrimSpace(label.Name)
				if name == "" {
					continue
				}
				record := core.NewRecord(labelsCollection)
				record.Set("project", project.Id)
				record.Set("name", name)
				record.Set("color", label.Color)
				if err := txApp.Save(record); err != nil {
					return err
				}
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
