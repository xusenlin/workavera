package main

import (
	"log"
	"os"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/plugins/migratecmd"
	"github.com/pocketbase/pocketbase/tools/osutils"

	_ "github.com/xusenlin/workavera/migrations"
)

var version = "dev"

func main() {
	app := pocketbase.New()
	app.RootCmd.Use = "workavera"
	app.RootCmd.Version = version
	registerBoard(app)

	migratecmd.MustRegister(app, app.RootCmd, migratecmd.Config{
		Automigrate: osutils.IsProbablyGoRun(),
	})

	app.OnServe().BindFunc(func(event *core.ServeEvent) error {
		event.Router.GET("/{path...}", apis.Static(os.DirFS("./frontend/dist"), true))

		return event.Next()
	})

	if err := app.Start(); err != nil {
		log.Fatal(err)
	}
}
