// Package frontend embeds the built UI assets so the binary is self-contained.
package frontend

import "embed"

// DistFS holds the Vite build output. Run `task build:ui` before building the
// binary; an empty dist (only .gitkeep) still compiles but serves no UI. The
// committed dist/.gitkeep keeps this directory present for fresh checkouts, and
// public/.gitkeep re-creates it after each Vite build (which empties dist).
//
//go:embed all:dist
var DistFS embed.FS
