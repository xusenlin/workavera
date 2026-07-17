package tools

import (
	"charm.land/fantasy"
	"github.com/pocketbase/pocketbase/core"

	workagent "github.com/xusenlin/workavera/internal/agent"
	"github.com/xusenlin/workavera/internal/preferences"
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

// destructiveTools lists tools that call agent.RequireApproval before
// mutating. Keep in sync when adding new approval-gated tools so API-key
// surfaces can filter them by scope.
var destructiveTools = map[string]bool{
	"board_delete_task":     true,
	"calendar_delete_event": true,
}

// IsDestructive reports whether the named tool performs an approval-gated
// destructive action.
func IsDestructive(name string) bool {
	return destructiveTools[name]
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
		newBoardDeleteTaskTool(f.app, actorID),
		newCalendarGetScheduleTool(f.app, actorID),
		newCalendarCreateEventTool(f.app, actorID),
		newCalendarUpdateEventTool(f.app, actorID),
		newCalendarDeleteEventTool(f.app, actorID),
		newReadingSearchTool(f.app, actorID),
		newReadingUpsertTool(f.app, actorID),
		newReadingGetTool(f.app, actorID),
		newReadingSummarizeTool(f.app, actorID),
		newDocsSearchTool(f.app, actorID),
		newDocsGetTool(f.app, actorID),
		newDocsUpsertTool(f.app, actorID),
		newDocsReplaceTool(f.app, actorID),
		newDocsWriteChunkTool(f.app, actorID),
	}
}

// ForChat returns the normal actor tools plus Chat-only memory tools when the
// user's memory preference is enabled. MCP deliberately continues to call
// ForActor, so memory tools are never exposed through API keys.
func (f *Factory) ForChat(scope workagent.ToolScope) []fantasy.AgentTool {
	tools := f.ForActor(scope.ActorID)
	if f.app == nil {
		return tools
	}
	preference, err := preferences.Get(f.app, scope.ActorID)
	if err != nil || !preference.MemoryEnabled {
		return tools
	}
	return append(tools,
		newMemoryUpsertTool(f.app, scope, preference.MemoryAutoCapture),
		newMemoryForgetTool(f.app, scope),
	)
}
