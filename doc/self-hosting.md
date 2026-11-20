# Self-hosting Workavera

[简体中文](./self-hosting.zh-CN.md) · [Back to README](../README.md)

Everything an administrator needs to install, configure, and run Workavera: installation, first-run setup, instance settings, privacy and local models, the sandbox, and building from source.

## Install

No toolchain needed—run the prebuilt image or binary.

### Docker

```bash
docker run -p 8090:8090 -v workavera-data:/app/pb_data ghcr.io/xusenlin/workavera:latest
```

The image runs everything except the [sandbox](#sandbox), which needs the prebuilt binary and Docker on the host.

### Prebuilt binary

Download the archive for your platform from [GitHub Releases](https://github.com/xusenlin/workavera/releases), extract it, and start the server from a terminal (it is a server process, so double-clicking the binary is not enough):

```bash
./workavera serve            # workavera.exe serve on Windows
```

By default it listens on <http://127.0.0.1:8090>. Pass `--http=0.0.0.0:8090` to accept connections from other machines.

## First-run setup

1. **Sign in with the demo user.** A fresh data directory automatically gets one application user: `demo@workavera.local` with password `workavera`.
2. **Secure the account.** Change the demo password from Profile before exposing Workavera to other machines or the public internet.
3. **Create the superuser.** PocketBase prints a one-time setup link containing a token, e.g. `http://127.0.0.1:8090/_/#/pbinstal/<token>`. Find it in the terminal output (or in `docker logs` for a detached container), open it, and create the superuser used to manage collections and application users. The superuser itself cannot sign in to Workavera.
4. **Add a model.** In Settings, add at least one model configuration before using Chat or AI summaries.
5. **Turn on the sandbox (optional).** With the prebuilt binary and Docker on the host, switch it on under Settings → Sandbox; the image is pulled on first use. See [Sandbox](#sandbox).

The demo user is seeded only when the `users` collection is empty, so upgrades do not add or overwrite an account in an existing workspace.

Instance-wide settings live in the `configs` collection, which only superusers can edit in the PocketBase dashboard. Besides the [sandbox](#sandbox) keys, `chat.max_steps` (default `80`, from 2 to 500) caps the model calls of one Chat response; the last one cannot call tools, so a response that reaches the cap still ends with a summary. `resources.max_file_size_mb` (default `10`, from 1 to 100) is the largest file accepted in Resources, for uploads and sandbox exports alike.

## Data privacy and local models

Self-hosting settles most of it: projects, tasks, docs, calendar, reading list, contacts, uploaded files, and the full chat history live in `pb_data` on your own machine—records in its SQLite database, files in its `storage` directory—and sandbox files stay in a Docker volume on the same host. Workavera has no telemetry and no vendor backend. The only traffic that leaves the server is traffic you configured—calls to the model provider you added in Settings, any external MCP servers you connected, and, once the sandbox is on, its image pull from `ghcr.io` and whatever its commands reach while `sandbox.network` allows it. Uploaded resources stay as original files on disk; the model never receives an original file directly—it only sees output from sandbox commands you let it run after importing a file, and an original file leaves the server only through a download link you approve (valid for five minutes) or a command run in a sandbox with network access.

The model call is usually the last piece of data that goes to a third party, and you can keep that in-house too. A local server is added in Settings exactly like a hosted provider, and all four protocols are available for it—OpenAI, OpenAI-compatible, Anthropic Messages, and Google—so LM Studio, Ollama, vLLM, and llama.cpp all fit; pick the protocol matching the endpoint your server exposes.

| Field | Value |
| --- | --- |
| Protocol | whichever endpoint the server exposes. LM Studio serves both OpenAI-compatible and Anthropic-compatible; Ollama serves OpenAI-compatible |
| Base URL | the server's origin, e.g. `http://127.0.0.1:1234` for Anthropic, `http://127.0.0.1:1234/v1` for the OpenAI protocols (Ollama: port 11434) |
| Model ID | whatever the server reports, e.g. `qwen/qwen3.8-27b` |
| API key | leave empty—local servers do not check it |

This is a supported path, not a theoretical one. A 27B-class local model—Qwen3.8 27B, MLX 4-bit, about 16 GB on disk—served by LM Studio on a single Apple silicon Mac, reached over its Anthropic-compatible endpoint, runs Chat end to end: multi-turn reasoning, workspace tool calls against Board, Calendar, Docs and Reading, and external MCP tools on top. With that setup the whole loop—your workspace data, the prompts built from it, the tool results—stays on your own hardware, and Workavera keeps working with the network unplugged.

Two things worth knowing before you rely on it:

- **Tool calling is where small models break first.** Answer quality degrades gently as models get smaller; the ability to emit well-formed tool calls turn after turn does not. Prefer a model with solid tool-calling support, and expect roughly 16 GB of free memory for a 27B 4-bit quantization.
- **A local model does not make external MCP servers local.** If you connect a hosted MCP server (web search, for example), the arguments the model sends it still leave your machine.

The base URL is dialed by the Workavera server, not by your browser. If Workavera runs in a container whose network mode cannot see the host's `127.0.0.1`, point it at `http://host.docker.internal:1234` instead.

## Resource download links

Download links the assistant creates for resources are only issued when the server's Application URL (PocketBase settings) uses HTTPS.

## Sandbox

The sandbox gives each user who turns it on in Settings a Linux container of their own (`workavera-<user ID>`, with `/workspace` in a named volume) where the Chat assistant runs commands, writes Python and Node scripts, and moves files to and from Resources and Docs. It needs:

- **Workavera running directly on the host** as the prebuilt binary, not in the Docker image. When Workavera runs in a container, the sandbox is refused: reaching Docker from there means mounting the host's Docker socket or running Docker-in-Docker with `--privileged`, and either hands the whole host to a network-facing service. The official image therefore keeps no Docker CLI.
- **Docker on the host**, with a `docker` command on the `PATH` that the system user running Workavera may use. On Linux that usually means the `docker` group, which is equivalent to root, so prefer a dedicated host or VM, or rootless Docker.

The image `ghcr.io/xusenlin/workavera-sandbox` (from [xusenlin/workavera-sandbox](https://github.com/xusenlin/workavera-sandbox)) is pulled on first use. Superusers control the sandbox in the PocketBase dashboard (`/_/`) through these records of the `configs` collection; invalid values are refused on save:

| Key | Default | Meaning |
| --- | --- | --- |
| `sandbox.enabled` | `true` | Master switch; `false` stops every sandbox container |
| `sandbox.image` | `"ghcr.io/xusenlin/workavera-sandbox:4"` | Image for new and rebuilt containers, e.g. a mirror |
| `sandbox.network` | `true` | Network master switch; `false` takes every sandbox offline |
| `sandbox.limits` | `{"memory": "1g", "cpus": 2, "pids": 512}` | Per-container limits, applied to existing containers at once |
| `sandbox.idle_timeout_minutes` | `60` | Stop a container after this long without use; `0` never stops it |

Security notes: containers share the host kernel and are no boundary for malicious code, so put an instance open to untrusted users on its own host or VM. A sandbox with network access can reach ports published on the host, the local network, and cloud metadata endpoints such as `169.254.169.254`; restrict the `workavera-sandbox` network with a firewall or turn `sandbox.network` off. Disk use has no quota, so watch the disk that holds Docker's data. `docker ps -a --filter label=workavera.sandbox=1` lists every sandbox.

## Mobile app compatibility

An app talks to the server's collections directly, so it needs a server new
enough to have the ones it queries. Upgrade the server first, then the apps.

| Android / iOS | Requires server | Because |
| --- | --- | --- |
| 1.0.4 | 0.1.1 or newer | task start dates, public project links, and subscription discovery |
| 1.0.2 | 0.0.10 or newer | task archiving reads `board_tasks.archived` |
| 1.0.1 | 0.0.9 or newer | user-owned MCP servers read `mcp_servers` |

A newer server keeps older apps working, minus what they do not know about: an
app older than 1.0.2 does not filter archived tasks, so archived tasks stay
visible on its Board.

## Building from source

Only needed when contributing or building from source. Requires Go 1.27.2+, Node.js with [pnpm](https://pnpm.io/), and [Task](https://taskfile.dev/) 3+.

```bash
cd frontend && pnpm install && cd ..   # once

task dev:go     # backend at http://127.0.0.1:8090 (admin UI at /_/)
task dev:ui     # Vite dev server at http://127.0.0.1:5173
task test       # go test ./...
task build      # self-contained binary with the frontend embedded
task release    # cross-compiled release archives in dist/
```

All tasks are defined in [`Taskfile.yml`](../Taskfile.yml); frontend-only commands are documented in [`frontend/README.md`](../frontend/README.md).
