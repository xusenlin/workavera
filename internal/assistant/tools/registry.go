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
		newFetchAndShowContactsTool(f.app, actorID),
		newFetchAndShowBoardProjectsTool(f.app, actorID),
		newFetchAndShowTasksTool(f.app, actorID),
		newCreateAIMicroAppTool(f.app, actorID),
		newUpdateAIMicroAppTool(f.app, actorID),
		newGetAIMicroAppTool(f.app, actorID),
		newListAIMicroAppsTool(f.app, actorID),
		newSearchAIMicroAppTool(f.app, actorID),
		newReplaceInAIMicroAppTool(f.app, actorID),
		newWriteAIMicroAppChunkTool(f.app, actorID),
	}
}
