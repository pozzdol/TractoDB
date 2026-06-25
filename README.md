# TractoDB

TractoDB (from Latin 'tracto': to handle, to manage) is a modern minimalist desktop database manager for Ubuntu. Inspired by DBeaver's power, designed with Linear's clarity.

![TractoDB Screenshot](docs/screenshot.png)

## Features

- **Multi-database** — PostgreSQL, MySQL, SQLite, and Redis, each shown with its own brand icon
- **Local & remote connections** — direct TCP (host + port) or a SQLite file, with optional SSL/TLS
- **Query editor** — Monaco (VS Code engine) with syntax highlighting and schema- and alias-aware autocomplete
- **Results grid** — column sorting, inline cell editing, infinite-scroll pagination, and copy as value / row JSON / `INSERT`
- **Table viewer** — per-table **Data**, **DDL**, **Columns**, and **Info** tabs; edit columns and rows in place
- **Schema browser** — navigate databases → tables → columns with per-engine metadata, indexes, and foreign keys
- **Backup & restore** — guided wizards that drive the native CLI tools (`pg_dump`, `pg_restore`, `mysqldump`, `mysql`) with auto-detection and manual path override
- **Production safety** — flag a connection as *Production* to block every write (INSERT/UPDATE/DELETE/DDL), with red warnings across the UI
- **Tabs & layout** — multiple query/table tabs and resizable sidebar / results / info panels, all persisted across restarts
- **Theming** — light, dark, or follow-system (auto-tracks OS theme changes)
- **Secure storage** — passwords in the OS keychain (libsecret / Keychain / Credential Vault), with an AES-256-GCM encrypted-file fallback; query history kept locally

## Requirements

### Ubuntu / Linux

```bash
# Build tools for native modules
sudo apt install build-essential python3 python3-pip

# For keytar (OS Keychain)
sudo apt install libsecret-1-dev

# For AppImage
sudo apt install libfuse2

# Optional — only needed for Backup & Restore, per engine you use
sudo apt install postgresql-client   # pg_dump, pg_restore, psql
sudo apt install mysql-client        # mysqldump, mysql
```

> TractoDB is a management tool only — it does **not** bundle any database engine
> or CLI tool. Install the engines and client tools you need separately; TractoDB
> connects to whatever is already running and auto-detects the CLI tools from PATH.

### macOS

```bash
xcode-select --install
```

## Development Setup

```bash
# Clone
git clone https://github.com/yourname/tractodb
cd tractodb

# Install dependencies (requires bun)
bun install

# Start development (hot reload)
bun start

# Type check
bun run typecheck

# Lint
bun run lint
```

## Build for Production

```bash
# Build .deb and .AppImage for Linux
bun run package:linux

# Output in ./release/
```

## Project Structure

See `CLAUDE.md` for the full project structure and architecture decisions.

## Contributing with Claude Code

This project is designed to be built with Claude Code. Key files:

| File | Purpose |
|---|---|
| `CLAUDE.md` | Architecture, conventions, commands |
| `AGENTS.md` | Agent workflow rules |
| `DESIGN.md` | Visual design system (colors, spacing, components) |
| `TASKS.md` | Implementation checklist |
| `CONTEXT.md` | Quick context for new sessions |
| `shared/ipc.ts` | IPC types and channel names |

### Starting a new Claude Code session

V1 is complete (see `TASKS.md`). To pick up new work, paste:
```
Read CONTEXT.md, CLAUDE.md, AGENTS.md, and DESIGN.md first.
Then check TASKS.md for status before starting.
```

## Tech Stack

- **Electron** — Desktop shell
- **React + TypeScript** — UI
- **Vite** — Build tool
- **Monaco Editor** — Query editor (VS Code engine)
- **Zustand** — State management
- **CSS Modules** — Styling (no CSS framework)
- **pg / mysql2 / better-sqlite3 / ioredis** — Database protocol clients
- **keytar** — OS keychain access for passwords
- **electron-builder** — Packaging (.deb / .AppImage)
- **bun** — Package manager

## License

MIT
