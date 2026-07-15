package board

import (
	"errors"
	"net/http"
	"strings"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
)

var (
	errBoardProjectNotFound    = errors.New("project not found")
	errBoardOwnerOnly          = errors.New("only the project owner can transfer ownership")
	errBoardOwnerTargetInvalid = errors.New("new owner is not an active user")
	errBoardOwnerUnchanged     = errors.New("new owner must be different from the current owner")
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

type transferBoardProjectOwnerRequestBody struct {
	OwnerID string `json:"ownerId"`
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

	states := make([]TemplateState, 0, len(request.States))
	for _, state := range request.States {
		states = append(states, TemplateState(state))
	}
	labels := make([]TemplateLabel, 0, len(request.Labels))
	for _, label := range request.Labels {
		labels = append(labels, TemplateLabel(label))
	}
	members := make([]UpsertMemberCommand, 0, len(request.Members))
	for _, member := range request.Members {
		if member.UserID == "" || member.UserID == event.Auth.Id {
			continue
		}
		role := member.Role
		if role != "admin" && role != "viewer" {
			role = "member"
		}
		members = append(members, UpsertMemberCommand{UserID: member.UserID, Role: role})
	}
	result, err := CreateProject(event.Request.Context(), event.App, event.Auth.Id, CreateProjectCommand{
		Name: request.Name, Description: request.Description,
		States: states, Labels: labels, Members: members,
	})
	if err != nil {
		return event.BadRequestError("Could not create project.", err)
	}

	project, err := event.App.FindRecordById(boardProjectsCollection, result.ID)
	if err != nil {
		return event.InternalServerError("Project was created but could not be loaded.", err)
	}
	return event.JSON(http.StatusCreated, project)
}

func transferBoardProjectOwnerRequest(event *core.RequestEvent) error {
	var request transferBoardProjectOwnerRequestBody
	if err := event.BindBody(&request); err != nil {
		return event.BadRequestError("Invalid ownership transfer data.", err)
	}

	projectID := strings.TrimSpace(event.Request.PathValue("id"))
	targetOwnerID := strings.TrimSpace(request.OwnerID)
	err := transferBoardProjectOwner(event.App, event.Auth.Id, projectID, targetOwnerID)
	if err != nil {
		switch {
		case errors.Is(err, errBoardProjectNotFound):
			return event.NotFoundError("Project not found.", err)
		case errors.Is(err, errBoardOwnerOnly):
			return event.ForbiddenError("Only the project owner can transfer ownership.", err)
		case errors.Is(err, errBoardOwnerTargetInvalid), errors.Is(err, errBoardOwnerUnchanged):
			return event.BadRequestError(err.Error(), nil)
		default:
			return event.InternalServerError("Could not transfer project ownership.", err)
		}
	}

	return event.JSON(http.StatusOK, map[string]string{
		"projectId": projectID,
		"ownerId":   targetOwnerID,
	})
}

func transferBoardProjectOwner(app core.App, actorID, projectID, targetOwnerID string) error {
	project, err := app.FindRecordById(boardProjectsCollection, projectID)
	if err != nil {
		return errBoardProjectNotFound
	}
	if project.GetString("owner") != actorID {
		return errBoardOwnerOnly
	}
	if targetOwnerID == "" {
		return errBoardOwnerTargetInvalid
	}
	if targetOwnerID == actorID {
		return errBoardOwnerUnchanged
	}

	actor, err := app.FindRecordById("users", actorID)
	if err != nil {
		return errBoardOwnerOnly
	}
	targetOwner, err := app.FindRecordById("users", targetOwnerID)
	if err != nil {
		return errBoardOwnerTargetInvalid
	}

	actorName := boardRecordName(app, "users", actorID)
	targetOwnerName := boardRecordName(app, "users", targetOwnerID)

	return app.RunInTransaction(func(txApp core.App) error {
		project, err := txApp.FindRecordById(boardProjectsCollection, projectID)
		if err != nil {
			return errBoardProjectNotFound
		}
		if project.GetString("owner") != actorID {
			return errBoardOwnerOnly
		}

		memberships, err := txApp.FindRecordsByFilter(
			boardProjectMembersCollection,
			"project = {:project} && user = {:user}",
			"",
			0,
			0,
			dbx.Params{"project": projectID, "user": targetOwnerID},
		)
		if err != nil {
			return err
		}
		for _, membership := range memberships {
			if err := txApp.Delete(membership); err != nil {
				return err
			}
		}

		formerOwnerMemberships, err := txApp.FindRecordsByFilter(
			boardProjectMembersCollection,
			"project = {:project} && user = {:user}",
			"",
			1,
			0,
			dbx.Params{"project": projectID, "user": actorID},
		)
		if err != nil {
			return err
		}
		if len(formerOwnerMemberships) > 0 {
			formerOwnerMemberships[0].Set("role", "member")
			if err := txApp.Save(formerOwnerMemberships[0]); err != nil {
				return err
			}
		} else {
			membersCollection, err := txApp.FindCollectionByNameOrId(boardProjectMembersCollection)
			if err != nil {
				return err
			}
			membership := core.NewRecord(membersCollection)
			membership.Set("project", projectID)
			membership.Set("user", actorID)
			membership.Set("role", "member")
			if err := txApp.Save(membership); err != nil {
				return err
			}
		}

		project.Set("owner", targetOwnerID)
		if err := txApp.Save(project); err != nil {
			return err
		}
		if err := ensureBoardProjectOrder(txApp, targetOwnerID, projectID); err != nil {
			return err
		}

		return saveBoardProjectOperationLog(txApp, actor, projectID, "transfer_owner", map[string]any{
			"owner": map[string]any{
				"from": map[string]string{"id": actor.Id, "name": actorName},
				"to":   map[string]string{"id": targetOwner.Id, "name": targetOwnerName},
			},
		})
	})
}

func validateBoardProjectMemberRequest(event *core.RecordRequestEvent) error {
	role := event.Record.GetString("role")
	if role != "admin" && role != "member" && role != "viewer" {
		return event.BadRequestError("Member role must be admin, member, or viewer.", nil)
	}

	project, err := event.App.FindRecordById(
		boardProjectsCollection,
		event.Record.GetString("project"),
	)
	if err != nil {
		return event.BadRequestError("Project not found.", err)
	}
	if event.Record.GetString("user") == project.GetString("owner") {
		return event.BadRequestError("The project owner cannot also be a project member.", nil)
	}

	return event.Next()
}
