package sandbox

import (
	"context"
	"os"
	"os/exec"
	"slices"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/pocketbase/dbx"
	"github.com/pocketbase/pocketbase/core"
	"github.com/pocketbase/pocketbase/tools/types"

	"github.com/xusenlin/workavera/internal/configs"
	workdocs "github.com/xusenlin/workavera/internal/docs"
	"github.com/xusenlin/workavera/internal/preferences"
	"github.com/xusenlin/workavera/internal/resources"
)

// TestDockerSandbox drives a real container end to end. It needs Docker and
// the default sandbox image, so it only runs when
// WORKAVERA_SANDBOX_DOCKER_TEST=1.
func TestDockerSandbox(t *testing.T) {
	if os.Getenv("WORKAVERA_SANDBOX_DOCKER_TEST") != "1" {
		t.Skip("set WORKAVERA_SANDBOX_DOCKER_TEST=1 to run against Docker")
	}
	app := newTestApp(t)
	resources.Register(app)
	user := createTestUser(t, app, "sandbox-docker@example.com")
	userID := user.Id
	const conv = "conv1234567890a"
	dir := ConversationDir(conv)
	m := newManager(app, newDocker())
	m.inContainer = func() bool { return false }
	ctx := context.Background()
	t.Cleanup(func() {
		_ = exec.Command("docker", "rm", "--force", containerName(userID)).Run()
		_ = exec.Command("docker", "volume", "rm", "--force", volumeName(userID)).Run()
	})

	if err := m.Enable(ctx, userID); err != nil {
		t.Fatalf("enable: %v", err)
	}
	waitForState(t, m, userID, StateRunning)
	if !m.ToolsEnabled(ctx, userID) {
		t.Fatal("an enabled sandbox must provide its tools")
	}

	inspect := func(format string) string {
		output, err := exec.Command("docker", "container", "inspect", "--format", format, containerName(userID)).Output()
		if err != nil {
			t.Fatalf("inspect %s: %v", format, err)
		}
		return strings.TrimSpace(string(output))
	}
	if got := inspect(`{{index .Config.Labels "workavera.sandbox"}} {{index .Config.Labels "workavera.user"}} {{.HostConfig.Memory}} {{.HostConfig.MemorySwap}} {{.HostConfig.NanoCpus}} {{.HostConfig.PidsLimit}} {{.Config.User}} {{.HostConfig.Privileged}}`); got != "1 "+userID+" 1073741824 1073741824 2000000000 512 workavera false" {
		t.Fatalf("unexpected container settings: %s", got)
	}
	if got := inspect(`{{range $name, $_ := .NetworkSettings.Networks}}{{$name}}{{end}}`); got != networkName {
		t.Fatalf("an online sandbox must be on %s, got %q", networkName, got)
	}
	if prompt := m.SystemPrompt(ctx, userID, conv); !strings.Contains(prompt, "Installed tools, as declared by the image: Node.js") || !strings.Contains(prompt, "Network: online") || !strings.Contains(prompt, "This conversation's folder is "+dir) {
		t.Fatalf("unexpected system prompt: %s", prompt)
	}

	if prompt := m.SystemPrompt(ctx, userID, conv); !strings.Contains(prompt, environmentNotesPath) || strings.Contains(prompt, "Current environment notes") {
		t.Fatalf("without notes the prompt must carry only the rules: %s", prompt)
	}
	if _, err := m.WriteFile(ctx, userID, conv, environmentNotesPath, "- playwright: pip install playwright && playwright install chromium (~/.cache/ms-playwright)\n"); err != nil {
		t.Fatal(err)
	}
	if prompt := m.SystemPrompt(ctx, userID, conv); !strings.Contains(prompt, "Current environment notes") || !strings.Contains(prompt, "playwright install chromium") {
		t.Fatalf("a running container's notes must reach the prompt: %s", prompt)
	}
	if _, err := m.WriteFile(ctx, userID, conv, environmentNotesPath, strings.Repeat("x", maxEnvironmentNotesBytes+100)); err != nil {
		t.Fatal(err)
	}
	if prompt := m.SystemPrompt(ctx, userID, conv); !strings.Contains(prompt, "[Cut at 4 KB.") || strings.Contains(prompt, strings.Repeat("x", maxEnvironmentNotesBytes+1)) {
		t.Fatal("notes must be cut at 4 KB")
	}
	if _, err := m.WriteFile(ctx, userID, conv, environmentNotesPath, "- jq: preinstalled\n"); err != nil {
		t.Fatal(err)
	}

	result, err := m.Bash(ctx, userID, conv, "echo \"$PWD $(whoami)\"; echo 中文 >&2; exit 3")
	if err != nil || result.Status != "completed" || *result.ExitCode != 3 || result.Stdout != dir+" workavera\n" || result.Stderr != "中文\n" {
		t.Fatalf("unexpected command result: %#v %v", result, err)
	}

	if _, err := m.WriteFile(ctx, userID, conv, "notes/plan.md", "# Plan\n\nalpha\nbeta\nalpha\n"); err != nil {
		t.Fatalf("write: %v", err)
	}
	read, err := m.ReadFile(ctx, userID, conv, dir+"/notes/plan.md", 3, 2)
	if err != nil || read.Content != "     3\talpha\n     4\tbeta\n" || read.TotalLines != 5 || read.NextOffset != 5 {
		t.Fatalf("unexpected read: %#v %v", read, err)
	}
	if _, err := m.EditFile(ctx, userID, conv, "notes/plan.md", "alpha", "gamma", false); errorCode(err) != CodeEditAmbiguous {
		t.Fatalf("an ambiguous edit must fail, got %v", err)
	}
	if _, err := m.EditFile(ctx, userID, conv, "notes/plan.md", "delta", "gamma", false); errorCode(err) != CodeEditNoMatch {
		t.Fatalf("a missing match must fail, got %v", err)
	}
	if edited, err := m.EditFile(ctx, userID, conv, "notes/plan.md", "alpha", "gamma", true); err != nil || edited.Replacements != 2 {
		t.Fatalf("replace all: %#v %v", edited, err)
	}
	if _, err := m.ReadFile(ctx, userID, "otherconv123456", "notes/plan.md", 0, 0); errorCode(err) != CodeFileNotFound {
		t.Fatalf("another conversation must resolve relative paths in its own folder, got %v", err)
	}
	if _, err := m.ReadFile(ctx, userID, "otherconv123456", dir+"/notes/plan.md", 0, 0); err != nil {
		t.Fatalf("another conversation must reach this one's files by absolute path: %v", err)
	}
	if _, err := m.ReadFile(ctx, userID, conv, "missing.txt", 0, 0); errorCode(err) != CodeFileNotFound {
		t.Fatalf("a missing file must fail, got %v", err)
	}

	chart := `python -c "
import matplotlib.pyplot as plt
plt.plot([1, 3, 2])
plt.title('季度趋势')
plt.savefig('chart.png')
"`
	if result, err := m.Bash(ctx, userID, conv, chart); err != nil || *result.ExitCode != 0 {
		t.Fatalf("chart: %#v %v", result, err)
	}
	if _, err := m.ReadFile(ctx, userID, conv, "chart.png", 0, 0); errorCode(err) != CodeFileNotText {
		t.Fatalf("reading an image must fail as not text, got %v", err)
	}
	exported, err := m.Export(ctx, userID, conv, ExportInput{Path: "chart.png", Target: "resource", Name: "Quarterly chart"})
	if err != nil || exported.Resource == nil || exported.Resource.MediaType != "image/png" || exported.Resource.DisplayName != "Quarterly chart" {
		t.Fatalf("export chart: %#v %v", exported, err)
	}
	doc, err := m.Export(ctx, userID, conv, ExportInput{Path: "notes/plan.md", Target: "doc"})
	if err != nil || doc.Document == nil || doc.Document.Title != "plan" || !strings.Contains(doc.Document.Content, "gamma") {
		t.Fatalf("export doc: %#v %v", doc, err)
	}
	if _, err := m.Export(ctx, userID, conv, ExportInput{Path: "chart.png", Target: "doc"}); errorCode(err) != CodeExportTypeUnsupport {
		t.Fatalf("exporting an image as a document must fail, got %v", err)
	}

	source, err := resources.Save(ctx, app, userID, "data.txt", "", []byte("a,b\n1,2\n"))
	if err != nil {
		t.Fatal(err)
	}
	imported, err := m.Import(ctx, userID, conv, "resource", source.ID)
	if err != nil || imported.Path != dir+"/resources/data.txt" {
		t.Fatalf("import resource: %#v %v", imported, err)
	}
	again, err := m.Import(ctx, userID, conv, "resource", source.ID)
	if err != nil || again.Path != dir+"/resources/data (2).txt" {
		t.Fatalf("a second import must not overwrite: %#v %v", again, err)
	}
	importedDoc, err := m.Import(ctx, userID, conv, "doc", doc.Document.ID)
	if err != nil || importedDoc.Path != dir+"/docs/plan.md" {
		t.Fatalf("import doc: %#v %v", importedDoc, err)
	}
	other := createTestUser(t, app, "sandbox-docker-other@example.com")
	foreign, err := workdocs.Create(ctx, app, other.Id, workdocs.CreateInput{Title: "Private"})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := m.Import(ctx, userID, conv, "doc", foreign.ID); err == nil {
		t.Fatal("another user's private document must not be importable")
	}

	background, err := m.Bash(ctx, userID, conv, "sleep 45; echo done")
	if err != nil || background.Status != "running" || background.PID == 0 || background.OutputDir == "" {
		t.Fatalf("a long command must move to the background: %#v %v", background, err)
	}
	if running, err := m.hasRunningJobs(ctx, containerName(userID)); err != nil || !running {
		t.Fatalf("the background job must count as running: %v %v", running, err)
	}
	if _, err := m.Bash(ctx, userID, conv, "kill -- -"+strconv.Itoa(background.PID)); err != nil {
		t.Fatal(err)
	}
	time.Sleep(500 * time.Millisecond)
	if running, err := m.hasRunningJobs(ctx, containerName(userID)); err != nil || running {
		t.Fatalf("a killed job must not count as running: %v %v", running, err)
	}

	cancelCtx, cancel := context.WithTimeout(ctx, 2*time.Second)
	_, err = m.Bash(cancelCtx, userID, conv, "sleep 23")
	cancel()
	if err == nil {
		t.Fatal("a cancelled command must return an error")
	}
	if result, err := m.Bash(ctx, userID, conv, "pgrep -f 'sleep 23' || echo gone"); err != nil || result.Stdout != "gone\n" {
		t.Fatalf("a cancelled command must be terminated in the container: %#v %v", result, err)
	}

	if err := m.SetOnline(ctx, userID, false); err != nil {
		t.Fatal(err)
	}
	if got := inspect(`{{len .NetworkSettings.Networks}}`); got != "0" {
		t.Fatalf("an offline sandbox must have no network, got %s", got)
	}
	if prompt := m.SystemPrompt(ctx, userID, conv); !strings.Contains(prompt, "the user turned it off") {
		t.Fatalf("the prompt must say the user is offline: %s", prompt)
	}
	if err := m.SetOnline(ctx, userID, true); err != nil {
		t.Fatal(err)
	}
	if got := inspect(`{{range $name, $_ := .NetworkSettings.Networks}}{{$name}}{{end}}`); got != networkName {
		t.Fatalf("going online again must reconnect, got %q", got)
	}

	created := inspect("{{.Created}}")
	if err := m.Rebuild(ctx, userID); err != nil {
		t.Fatal(err)
	}
	waitForState(t, m, userID, StateRunning)
	if inspect("{{.Created}}") == created {
		t.Fatal("rebuilding must create a new container")
	}
	if result, err := m.Bash(ctx, userID, conv, "test -f notes/plan.md && echo kept"); err != nil || result.Stdout != "kept\n" {
		t.Fatalf("rebuilding must keep /workspace: %#v %v", result, err)
	}

	if _, err := m.docker.run(ctx, nil, "stop", containerName(userID)); err != nil {
		t.Fatal(err)
	}
	if status, _ := m.Status(ctx, userID); status.Container.State != StateStopped {
		t.Fatalf("a stopped container must report stopped: %#v", status.Container)
	}
	if prompt := m.SystemPrompt(ctx, userID, conv); !strings.Contains(prompt, environmentNotesPath) || strings.Contains(prompt, "Current environment notes") || inspect("{{.State.Running}}") != "false" {
		t.Fatalf("a stopped container keeps the rules, drops the notes, and stays stopped: %s", prompt)
	}
	if result, err := m.Bash(ctx, userID, conv, "ls notes"); err != nil || result.Stdout != "plan.md\n" {
		t.Fatalf("a tool call must start a stopped container: %#v %v", result, err)
	}

	setConfig(t, app, configs.SandboxLimitsKey, `{"memory": "512m", "cpus": 1, "pids": 256}`)
	m.applyConfig(configs.SandboxLimitsKey)
	if got := inspect("{{.HostConfig.Memory}} {{.HostConfig.NanoCpus}} {{.HostConfig.PidsLimit}}"); got != "536870912 1000000000 256" {
		t.Fatalf("new limits must apply without a rebuild: %s", got)
	}

	setConfig(t, app, configs.SandboxNetworkKey, `false`)
	m.applyConfig(configs.SandboxNetworkKey)
	if got := inspect(`{{len .NetworkSettings.Networks}}`); got != "0" {
		t.Fatalf("turning the network off must take every sandbox offline, got %s", got)
	}
	if err := m.SetOnline(ctx, userID, true); errorCode(err) != CodeNetworkDisabled {
		t.Fatalf("users cannot go online while the administrator forbids it, got %v", err)
	}
	setConfig(t, app, configs.SandboxNetworkKey, `true`)
	m.applyConfig(configs.SandboxNetworkKey)
	if got := inspect(`{{range $name, $_ := .NetworkSettings.Networks}}{{$name}}{{end}}`); got != networkName {
		t.Fatalf("turning the network on must reconnect online users, got %q", got)
	}

	setConfig(t, app, configs.SandboxIdleTimeoutKey, `5`)
	m.mu.Lock()
	m.users[userID].activity = time.Now().Add(-6 * time.Minute)
	m.mu.Unlock()
	m.stopIdle()
	if inspect("{{.State.Running}}") != "false" {
		t.Fatal("an idle sandbox must be stopped")
	}

	if err := m.Reset(ctx, userID); err != nil {
		t.Fatal(err)
	}
	waitForState(t, m, userID, StateRunning)
	if result, err := m.Bash(ctx, userID, conv, "find /workspace -mindepth 1 -not -path /workspace/chats -not -path "+dir+" | wc -l"); err != nil || strings.TrimSpace(result.Stdout) != "0" {
		t.Fatalf("resetting must empty /workspace: %#v %v", result, err)
	}

	if err := m.Disable(ctx, userID); err != nil {
		t.Fatal(err)
	}
	if info, err := m.docker.inspectContainer(ctx, containerName(userID)); err != nil || info.Exists {
		t.Fatalf("disabling must remove the container: %#v %v", info, err)
	}
	if err := exec.Command("docker", "volume", "inspect", volumeName(userID)).Run(); err != nil {
		t.Fatal("disabling must keep the workspace volume")
	}
	if _, err := m.Bash(ctx, userID, conv, "true"); errorCode(err) != CodeDisabled {
		t.Fatalf("a disabled sandbox must refuse tools, got %v", err)
	}
	if preference, _ := preferences.Get(app, userID); preference.SandboxEnabled {
		t.Fatal("disabling must save the preference")
	}
}

func waitForState(t *testing.T, m *Manager, userID, want string) {
	t.Helper()
	deadline := time.Now().Add(3 * time.Minute)
	var states []string
	for time.Now().Before(deadline) {
		status, err := m.Status(context.Background(), userID)
		if err != nil {
			t.Fatal(err)
		}
		state := status.Container.State
		if status.Container.Phase != "" {
			state += ":" + status.Container.Phase
		}
		if !slices.Contains(states, state) {
			states = append(states, state)
		}
		switch status.Container.State {
		case want:
			return
		case StateError:
			t.Fatalf("preparation failed: %s", status.Container.Error)
		}
		time.Sleep(200 * time.Millisecond)
	}
	t.Fatalf("timed out waiting for %s; saw %v", want, states)
}

func setConfig(t *testing.T, app core.App, key, value string) {
	t.Helper()
	record, err := app.FindFirstRecordByFilter(configs.CollectionName, "key = {:key}", dbx.Params{"key": key})
	if err != nil {
		t.Fatal(err)
	}
	record.Set("value", types.JSONRaw(value))
	if err := app.Save(record); err != nil {
		t.Fatal(err)
	}
}
