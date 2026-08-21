package main

import (
	"io/fs"
	"log"
	"path"
	"strings"

	"github.com/pocketbase/pocketbase"
	"github.com/pocketbase/pocketbase/apis"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/plugins/migratecmd"
	"github.com/pocketbase/pocketbase/tools/osutils"

	"github.com/xusenlin/workavera/frontend"
	"github.com/xusenlin/workavera/internal/account"
	"github.com/xusenlin/workavera/internal/board"
	calendarfeature "github.com/xusenlin/workavera/internal/calendar"
	"github.com/xusenlin/workavera/internal/chat"
	"github.com/xusenlin/workavera/internal/configs"
	"github.com/xusenlin/workavera/internal/contacts"
	"github.com/xusenlin/workavera/internal/docs"
	"github.com/xusenlin/workavera/internal/llm"
	"github.com/xusenlin/workavera/internal/mcpclient"
	"github.com/xusenlin/workavera/internal/mcpserver"
	"github.com/xusenlin/workavera/internal/memory"
	"github.com/xusenlin/workavera/internal/notifications"
	"github.com/xusenlin/workavera/internal/preferences"
	"github.com/xusenlin/workavera/internal/reading"
	_ "github.com/xusenlin/workavera/migrations"
)

var version = "dev"

const (
	assetsPrefix           = "/assets/"
	immutableCacheControl  = "public, max-age=31536000, immutable"
	revalidateCacheControl = "no-cache"
)

func main() {
	app := pocketbase.New()
	app.RootCmd.Use = "workavera"
	app.RootCmd.Version = version
	account.Register(app)
	board.Register(app)
	calendarfeature.Register(app)
	configs.Register(app)
	contacts.Register(app)
	docs.Register(app)
	reading.Register(app)
	llm.Register(app)
	mcpclient.Register(app, version)
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
		// PocketBase compresses and caches only its own admin UI, so the app's
		// assets need the same treatment or every visitor re-downloads the
		// whole bundle uncompressed.
		event.Router.GET("/{path...}", apis.Static(distFS, true)).
			BindFunc(func(e *core.RequestEvent) error {
				urlPath := e.Request.URL.Path

				switch {
				case strings.HasPrefix(urlPath, assetsPrefix):
					// Vite fingerprints everything under /assets, so those
					// URLs never change meaning.
					e.Response.Header().Set("Cache-Control", immutableCacheControl)
				case path.Ext(urlPath) == "":
					// Extension-less paths are app routes served by the
					// index.html fallback. Embedded files carry no modtime and
					// so no validator, so without this an unlucky heuristic
					// cache could pin a visitor to an old index.html long
					// after the deploy that removed the bundles it names.
					e.Response.Header().Set("Cache-Control", revalidateCacheControl)
				}

				return e.Next()
			}).
			Bind(apis.GzipWithConfig(apis.GzipConfig{
				// Below roughly a packet, the gzip header costs more than it
				// saves.
				MinLength: 1024,
			}))

		return event.Next()
	})

	if err := app.Start(); err != nil {
		log.Fatal(err)
	}
}
