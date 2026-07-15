package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
	"github.com/pocketbase/pocketbase/tools/types"
)

const (
	boardProjectOrdersCollection = "board_project_orders"
	boardProjectOrderStep        = 1024
	boardProjectOrderBase        = 1024 * 1024 * 1024
)

func init() {
	m.Register(createBoardProjectOrdersCollection, dropBoardProjectOrdersCollection)
}

func createBoardProjectOrdersCollection(app core.App) error {
	users, err := app.FindCollectionByNameOrId(usersCollectionName)
	if err != nil {
		return err
	}
	projects, err := app.FindCollectionByNameOrId(boardProjectsCollection)
	if err != nil {
		return err
	}

	orders := core.NewBaseCollection(boardProjectOrdersCollection)
	orderRead := `@request.auth.id != "" && user = @request.auth.id && (project.owner = @request.auth.id || project.board_project_members_via_project.user ?= @request.auth.id)`
	orders.ListRule = types.Pointer(orderRead)
	orders.ViewRule = orders.ListRule
	orders.CreateRule = types.Pointer(`@request.auth.id != "" && @request.body.user = @request.auth.id && (project.owner = @request.auth.id || project.board_project_members_via_project.user ?= @request.auth.id)`)
	orders.UpdateRule = types.Pointer(orderRead + ` && @request.body.user:changed = false && @request.body.project:changed = false`)
	orders.DeleteRule = types.Pointer(orderRead)
	orders.Fields.Add(
		&core.RelationField{Name: "user", CollectionId: users.Id, MaxSelect: 1, Required: true, CascadeDelete: true},
		&core.RelationField{Name: "project", CollectionId: projects.Id, MaxSelect: 1, Required: true, CascadeDelete: true},
		&core.NumberField{Name: "sort_order", Required: true},
		&core.AutodateField{Name: "created", OnCreate: true},
		&core.AutodateField{Name: "updated", OnCreate: true, OnUpdate: true},
	)
	orders.AddIndex("idx_board_project_orders_user_project", true, "user, project", "")
	orders.AddIndex("idx_board_project_orders_user_sort", false, "user, sort_order", "")
	if err := app.Save(orders); err != nil {
		return err
	}

	return backfillBoardProjectOrders(app, orders)
}

func backfillBoardProjectOrders(app core.App, orders *core.Collection) error {
	projects, err := app.FindRecordsByFilter(boardProjectsCollection, "", "-created,-id", 0, 0)
	if err != nil {
		return err
	}
	memberships, err := app.FindRecordsByFilter(boardProjectMembersCollection, "", "created,id", 0, 0)
	if err != nil {
		return err
	}
	membersByProject := make(map[string][]string)
	for _, membership := range memberships {
		projectID := membership.GetString("project")
		membersByProject[projectID] = append(membersByProject[projectID], membership.GetString("user"))
	}

	positions := make(map[string]int)
	for _, project := range projects {
		participants := append([]string{project.GetString("owner")}, membersByProject[project.Id]...)
		seen := make(map[string]bool, len(participants))
		for _, userID := range participants {
			if userID == "" || seen[userID] {
				continue
			}
			seen[userID] = true
			positions[userID]++
			record := core.NewRecord(orders)
			record.Set("user", userID)
			record.Set("project", project.Id)
			record.Set("sort_order", boardProjectOrderBase+positions[userID]*boardProjectOrderStep)
			if err := app.Save(record); err != nil {
				return err
			}
		}
	}
	return nil
}

func dropBoardProjectOrdersCollection(app core.App) error {
	collection, err := app.FindCollectionByNameOrId(boardProjectOrdersCollection)
	if err != nil {
		return err
	}
	return app.Delete(collection)
}
