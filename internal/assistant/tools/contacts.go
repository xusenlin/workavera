package tools

import (
	"context"
	"encoding/json"

	"charm.land/fantasy"
	"github.com/pocketbase/pocketbase/core"
	"github.com/xusenlin/workavera/internal/contacts"
)

type contactsInput struct {
	Query string `json:"query,omitempty" description:"按姓名或职位筛选；留空时返回前几位联系人"`
	Limit int    `json:"limit,omitempty" description:"最多返回多少条，默认 10，最大 20"`
}

func newContactsTool(app core.App, actorID string) fantasy.AgentTool {
	return fantasy.NewAgentTool(
		"get_contacts",
		"搜索当前用户可见的团队联系人，支持按姓名或职位模糊匹配，返回姓名、职位和在线状态。结果不包含手机号等敏感资料。",
		func(ctx context.Context, input contactsInput, _ fantasy.ToolCall) (fantasy.ToolResponse, error) {
			result, err := contacts.Search(ctx, app, actorID, contacts.SearchOptions{Query: input.Query, Limit: input.Limit})
			if err != nil {
				app.Logger().Error("assistant contacts tool failed", "actorId", actorID, "error", err)
				return fantasy.NewTextErrorResponse("联系人查询暂时不可用"), nil
			}
			data, err := json.Marshal(result)
			if err != nil {
				return fantasy.NewTextErrorResponse("联系人结果序列化失败"), nil
			}
			return fantasy.NewTextResponse(string(data)), nil
		},
	)
}
