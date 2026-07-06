package tools

import (
	"context"
	"encoding/json"

	"charm.land/fantasy"
	"github.com/pocketbase/pocketbase/core"
	"github.com/xusenlin/workavera/internal/board"
)

type boardProjectsInput struct {
	Query           string `json:"query,omitempty" description:"按项目名称筛选"`
	IncludeArchived bool   `json:"includeArchived,omitempty" description:"是否包含已归档项目，默认不包含"`
	Limit           int    `json:"limit,omitempty" description:"最多返回多少条，默认 10，最大 20"`
}

func newBoardProjectsTool(app core.App, actorID string) fantasy.AgentTool {
	return fantasy.NewAgentTool(
		"get_board_projects",
		"搜索当前用户拥有或参与的看板项目。当用户询问项目、看板或任务进度时调用。",
		func(ctx context.Context, input boardProjectsInput, _ fantasy.ToolCall) (fantasy.ToolResponse, error) {
			result, err := board.SearchVisibleProjects(ctx, app, actorID, board.ProjectSearchOptions{
				Query:           input.Query,
				IncludeArchived: input.IncludeArchived,
				Limit:           input.Limit,
			})
			if err != nil {
				app.Logger().Error("assistant board projects tool failed", "actorId", actorID, "error", err)
				return fantasy.NewTextErrorResponse("项目查询暂时不可用"), nil
			}
			data, err := json.Marshal(result)
			if err != nil {
				return fantasy.NewTextErrorResponse("项目结果序列化失败"), nil
			}
			return fantasy.NewTextResponse(string(data)), nil
		},
	)
}
