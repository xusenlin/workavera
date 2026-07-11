package tools

import (
	"charm.land/fantasy"
	"github.com/pocketbase/pocketbase/core"
)

// Factory owns application dependencies and creates actor-scoped Fantasy
// tools for a single run. FantasyRunner only receives the resulting factory
// function and remains independent from PocketBase.
type Factory struct {
	app core.App
}

func NewFactory(app core.App) *Factory {
	return &Factory{app: app}
}

func (f *Factory) ForActor(actorID string) []fantasy.AgentTool {
	return []fantasy.AgentTool{
		newContactsSearchTool(f.app, actorID),
		newBoardSearchProjectsTool(f.app, actorID),
		newBoardGetProjectTool(f.app, actorID),
		newBoardSearchTasksTool(f.app, actorID),
		newBoardListTemplatesTool(f.app, actorID),
		newBoardCreateProjectTool(f.app, actorID),
		newBoardUpdateProjectTool(f.app, actorID),
		newBoardUpsertStateTool(f.app, actorID),
		newBoardUpsertLabelTool(f.app, actorID),
		newBoardUpsertMemberTool(f.app, actorID),
		newBoardCreateTaskTool(f.app, actorID),
		newBoardUpdateTaskTool(f.app, actorID),
		newReadingSearchTool(f.app, actorID),
		newReadingUpsertTool(f.app, actorID),
		newReadingGetTool(f.app, actorID),
		newReadingSummarizeTool(f.app, actorID),
		newDocsSearchTool(f.app, actorID),
		newDocsGetTool(f.app, actorID),
		newDocsUpsertTool(f.app, actorID),
		newDocsReplaceTool(f.app, actorID),
		newMicroappsCreateTool(f.app, actorID),
		newMicroappsUpdateTool(f.app, actorID),
		newMicroappsGetTool(f.app, actorID),
		newMicroappsListTool(f.app, actorID),
		newMicroappsSearchTool(f.app, actorID),
		newMicroappsReplaceTool(f.app, actorID),
		newMicroappsWriteChunkTool(f.app, actorID),
	}
}
