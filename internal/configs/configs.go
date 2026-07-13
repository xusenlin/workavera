package configs

import (
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
)

type systemConfigRequest struct {
	Theme *string `json:"theme"`
}

func Register(app core.App) {
	app.OnServe().BindFunc(func(event *core.ServeEvent) error {
		group := event.Router.Group("/api/configs").Bind(apis.RequireAuth("users"))
		group.GET("/system", getSystemConfig)
		group.PATCH("/system", updateSystemConfig)
		return event.Next()
	})
}

const (
	CollectionName    = "configs"
	SystemTimezoneKey = "system.timezone"
	SystemThemeKey    = "system.theme"
	defaultTimezone   = "Asia/Shanghai"
	defaultTheme      = "system"
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

func SystemTheme(app core.App) string {
	value, err := Get(app, SystemThemeKey)
	if err == nil {
		if theme, ok := value.(string); ok && (theme == "system" || theme == "light" || theme == "dark") {
			return theme
		}
	}
	return defaultTheme
}

func getSystemConfig(event *core.RequestEvent) error {
	return event.JSON(http.StatusOK, map[string]string{"timezone": SystemLocation(event.App).String(), "theme": SystemTheme(event.App)})
}

func updateSystemConfig(event *core.RequestEvent) error {
	var request systemConfigRequest
	if err := event.BindBody(&request); err != nil {
		return event.BadRequestError("Invalid system configuration.", err)
	}
	if request.Theme == nil {
		return event.BadRequestError("Provide theme.", nil)
	}
	var theme string
	if request.Theme != nil {
		theme = strings.TrimSpace(*request.Theme)
		if theme != "system" && theme != "light" && theme != "dark" {
			return event.BadRequestError("Theme must be system, light, or dark.", nil)
		}
	}
	if err := event.App.RunInTransaction(func(tx core.App) error {
		return setValue(tx, SystemThemeKey, theme)
	}); err != nil {
		return event.BadRequestError("Could not update system configuration.", err)
	}
	return getSystemConfig(event)
}

func setValue(app core.App, key string, value any) error {
	record, err := app.FindFirstRecordByFilter(CollectionName, "key = {:key}", dbx.Params{"key": key})
	if err != nil {
		return err
	}
	record.Set("value", value)
	return app.Save(record)
}
