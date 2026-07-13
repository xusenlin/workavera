package configs

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
)

func Register(app core.App) {
	app.OnServe().BindFunc(func(event *core.ServeEvent) error {
		group := event.Router.Group("/api/configs").Bind(apis.RequireAuth("users"))
		group.GET("/system", getSystemConfig)
		return event.Next()
	})
}

const (
	CollectionName    = "configs"
	SystemTimezoneKey = "system.timezone"
	defaultTimezone   = "Asia/Shanghai"
)

func Get(app core.App, key string) (any, error) {
	record, err := app.FindFirstRecordByFilter(CollectionName, "key = {:key}", dbx.Params{"key": key})
	if err != nil {
		return nil, err
	}
	var value any
	if err := json.Unmarshal([]byte(record.GetString("value")), &value); err != nil {
		return nil, err
	}
	return value, nil
}

func SystemLocation(app core.App) *time.Location {
	value, err := Get(app, SystemTimezoneKey)
	if err == nil {
		if name, ok := value.(string); ok {
			if location, loadErr := time.LoadLocation(name); loadErr == nil {
				return location
			}
		}
	}
	location, err := time.LoadLocation(defaultTimezone)
	if err == nil {
		return location
	}
	return time.UTC
}

func getSystemConfig(event *core.RequestEvent) error {
	return event.JSON(http.StatusOK, map[string]string{"timezone": SystemLocation(event.App).String()})
}
