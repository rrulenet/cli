# rrulenet CLI

Hybrid CLI for:
- local recurring jobs (cron-like, RRule-based)
- cloud schedules on rrule.net

## Requirements

- Node.js 24+

## Dev

From the repository root:

```bash
cd cli
npm install
npm run build
npm link
rrulenet --help
```

`npm link` exposes the global `rrulenet` binary from your local checkout.

## SQLite runtime note

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

## Run locally

After `npm link`, use the global binary:

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
