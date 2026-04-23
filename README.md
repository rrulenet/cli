<p align="center">
  <a href="https://rrule.net">
    <img src="./assets/avatar.svg" alt="rrule.net" width="96" height="96">
  </a>
</p>

<h1 align="center">@rrulenet/cli</h1>

<p align="center">
  Command-line workflows for recurring jobs, local schedulers, and rrule.net cloud schedules.
</p>

<p align="center">
  <a href="https://rrule.net">rrule.net</a> •
  <a href="https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Temporal">Temporal API</a> •
  <strong>@rrulenet ecosystem</strong>
</p>

<p align="center">
  <code>@rrulenet/rrule</code> ·
  <code>@rrulenet/recurrence</code> ·
  <code>@rrulenet/core</code> ·
  <code>@rrulenet/cli</code>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@rrulenet/cli"><img src="https://img.shields.io/npm/v/%40rrulenet%2Fcli" alt="npm version"></a>
  <a href="https://rrulenet.github.io/cli/coverage.json"><img src="https://img.shields.io/endpoint?url=https://rrulenet.github.io/cli/coverage.json" alt="Coverage"></a>
  <img src="https://img.shields.io/badge/license-MIT-2563EB" alt="MIT License">
</p>

<p align="center">
  <sub><strong>@rrulenet/rrule</strong>: classic API · <strong>@rrulenet/recurrence</strong>: Temporal-first API · <strong>@rrulenet/core</strong>: engine · <strong>@rrulenet/cli</strong>: workflows</sub>
</p>

`@rrulenet/cli` provides the command-line interface in the ecosystem. It is designed for teams that want to run recurring jobs locally, operate a persistent local scheduler, and work with rrule.net cloud schedules from the same tool.

Use `@rrulenet/cli` when you want operational workflows around schedules. Use `@rrulenet/rrule` or `@rrulenet/recurrence` when you want to embed recurrence logic directly in application code.

## Why this exists

Recurring schedules seem simple until real-world constraints appear:

- timezones and DST
- long-running schedules
- end-of-month and leap-year edge cases
- reliability over time

`rrulenet` gives you a deterministic RRULE-based model for both local execution and cloud-managed schedules.

## What this CLI does

Use `rrulenet` to:

- run local recurring jobs from the command line
- run a persistent local scheduler on your machine
- manage cloud schedules on `rrule.net`

## Requirements

- Node.js 24+

## Installation

```bash
npm install -g @rrulenet/cli
rrulenet --help
```

## Quick start

```bash
rrulenet --help
rrulenet local add "FREQ=DAILY;BYHOUR=9;BYMINUTE=0;BYSECOND=0" -- echo "sync"
rrulenet local list
rrulenet list
```

Local data is stored in `./.rrulenet` relative to your current working directory.
Override with:

```bash
RRULENET_DATA_DIR=/path/to/data rrulenet local list
```

## Cloud setup

```bash
rrulenet config set cloud.api_url https://api.rrule.net
rrulenet config set cloud.token <your_api_key_or_token>
RRULENET_TOKEN=<your_api_key_or_token> rrulenet cloud list
```

## Local and cloud

The CLI supports both local execution and cloud schedule management.

| Capability | Local CLI | rrule.net cloud |
| --- | --- | --- |
| RRULE scheduling | ✅ | ✅ |
| Local command execution | ✅ | ❌ |
| Persistent background runner | ✅ | ✅ managed |
| Cloud-managed schedules | ❌ | ✅ |
| API-backed schedule operations | via `cloud` commands | ✅ |

Use the CLI to build, test, and run schedules locally.

Use `rrule.net` when you want managed cloud execution and API-backed schedule operations.

## Run as a background service

`rrulenet local run` can be managed by a user-level service manager. The CLI does
not install services automatically, but it can generate a template for:

- `launchd` on macOS
- `systemd --user` on Linux

The generated service writes logs in `RRULENET_DATA_DIR`:

- `rrulenet-runner.out.log`
- `rrulenet-runner.err.log`

### macOS (`launchd`)

Generate a plist:

```bash
rrulenet local service print --target launchd > ~/Library/LaunchAgents/net.rrule.local-runner.plist
```

Load and start it:

```bash
launchctl unload ~/Library/LaunchAgents/net.rrule.local-runner.plist 2>/dev/null
launchctl load ~/Library/LaunchAgents/net.rrule.local-runner.plist
launchctl start net.rrule.local-runner
```

Stop it:

```bash
launchctl stop net.rrule.local-runner
launchctl unload ~/Library/LaunchAgents/net.rrule.local-runner.plist
```

Check logs:

```bash
tail -f ./.rrulenet/rrulenet-runner.out.log
tail -f ./.rrulenet/rrulenet-runner.err.log
```

If you use a custom data directory, generate the template with:

```bash
rrulenet local service print --target launchd --data-dir /path/to/data
```

### Linux (`systemd --user`)

Generate a unit:

```bash
mkdir -p ~/.config/systemd/user
rrulenet local service print --target systemd-user > ~/.config/systemd/user/rrulenet-local-runner.service
```

Reload and start it:

```bash
systemctl --user daemon-reload
systemctl --user enable --now rrulenet-local-runner
```

Stop it:

```bash
systemctl --user disable --now rrulenet-local-runner
```

Check status and logs:

```bash
systemctl --user status rrulenet-local-runner
journalctl --user -u rrulenet-local-runner -f
tail -f ./.rrulenet/rrulenet-runner.out.log
tail -f ./.rrulenet/rrulenet-runner.err.log
```

To change the polling interval or binary path:

```bash
rrulenet local service print --target systemd-user --interval-ms 10000 --bin /absolute/path/to/rrulenet
```

## Dev

For development, `npm link` exposes the global `rrulenet` binary from your local
checkout without a separate global install:

```bash
cd cli
npm install
npm run build
npm link
rrulenet --help
```

## Notes

The local scheduler uses Node's native `node:sqlite` module.

On current Node 24+ releases, `node:sqlite` does not require the old
`--experimental-sqlite` flag anymore. Node may still print an
`ExperimentalWarning` when the module is loaded.

If you want to hide that warning when running the CLI, use:

```bash
NODE_OPTIONS=--disable-warning=ExperimentalWarning rrulenet local list
```

This suppresses `ExperimentalWarning` messages for the Node process. We do not
recommend using broader flags such as `--no-warnings`.

## License

MIT

This license applies to the CLI source code in this repository only. Hosted
`rrule.net` services and APIs are governed separately.
