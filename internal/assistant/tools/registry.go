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
		newBoardSearchTasksTool(f.app, actorID),
		newMicroappsCreateTool(f.app, actorID),
		newMicroappsUpdateTool(f.app, actorID),
		newMicroappsGetTool(f.app, actorID),
		newMicroappsListTool(f.app, actorID),
		newMicroappsSearchTool(f.app, actorID),
		newMicroappsReplaceTool(f.app, actorID),
		newMicroappsWriteChunkTool(f.app, actorID),
	}
}
