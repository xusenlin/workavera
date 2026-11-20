package migrations

import (
	"github.com/pocketbase/pocketbase/core"
	m "github.com/pocketbase/pocketbase/migrations"
)

const sandboxImage4 = `"ghcr.io/xusenlin/workavera-sandbox:4"`

func init() {
	m.Register(
		func(app core.App) error { return moveSandboxImage(app, sandboxImage3, sandboxImage4) },
		func(app core.App) error { return moveSandboxImage(app, sandboxImage4, sandboxImage3) },
	)
}
