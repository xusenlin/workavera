package main

import (
	"io/fs"
	"log"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/plugins/migratecmd"
	"github.com/pocketbase/pocketbase/tools/osutils"

	"github.com/xusenlin/workavera/frontend"
	"github.com/xusenlin/workavera/internal/board"
	calendarfeature "github.com/xusenlin/workavera/internal/calendar"
	"github.com/xusenlin/workavera/internal/chat"
	"github.com/xusenlin/workavera/internal/configs"
	"github.com/xusenlin/workavera/internal/contacts"
	"github.com/xusenlin/workavera/internal/docs"
	"github.com/xusenlin/workavera/internal/llm"
	"github.com/xusenlin/workavera/internal/mcpserver"
	"github.com/xusenlin/workavera/internal/memory"
	"github.com/xusenlin/workavera/internal/notifications"
	"github.com/xusenlin/workavera/internal/preferences"
	"github.com/xusenlin/workavera/internal/reading"
	_ "github.com/xusenlin/workavera/migrations"
)

var version = "dev"

func main() {
	app := pocketbase.New()
	app.RootCmd.Use = "workavera"
	app.RootCmd.Version = version
	board.Register(app)
	calendarfeature.Register(app)
	configs.Register(app)
	contacts.Register(app)
	docs.Register(app)
	reading.Register(app)
	llm.Register(app)
	mcpserver.Register(app, version)
	notifications.Register(app)
	preferences.Register(app)
	memory.Register(app)
	chat.Register(app)

	migratecmd.MustRegister(app, app.RootCmd, migratecmd.Config{
		Automigrate: osutils.IsProbablyGoRun(),
	})

	distFS, err := fs.Sub(frontend.DistFS, "dist")
	if err != nil {
		log.Fatal(err)
	}

	app.OnServe().BindFunc(func(event *core.ServeEvent) error {
		event.Router.GET("/{path...}", apis.Static(distFS, true))

		return event.Next()
	})

	if err := app.Start(); err != nil {
		log.Fatal(err)
	}
}
