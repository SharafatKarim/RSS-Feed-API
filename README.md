# linkerine-server

Lightweight Express.js API that fetches, parses, and normalises RSS/Atom feeds into a consistent JSON schema. Also discovers feed URLs from any website.

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/feed?url=` | Fetch & parse an RSS or Atom feed |
| `GET` | `/discover?url=` | Discover feed URLs on a website |
| `GET` | `/health` | Health check |
| `GET` | `/docs` | Swagger UI |
| `GET` | `/docs/spec.json` | Raw OpenAPI 3.1 spec |

All feed routes are also available under the `/api/` prefix (e.g. `/api/feed`).

## Setup

```bash
cp .env.example .env   # then edit .env
pnpm install
```

**.env**

```
PORT=3001
CORS_ALLOWLIST=http://localhost:3000,https://linkerine.app
```

Set `CORS_ALLOWLIST=*` to allow all origins (not recommended for production).

## Usage

```bash
# Development (hot-reload)
pnpm dev

# Production
pnpm build
pnpm start
```

## Examples

```bash
# Parse a feed
curl "http://localhost:3001/feed?url=https://blog.sharafat.xyz/index.xml"

# Discover feeds on a site
curl "http://localhost:3001/discover?url=https://blog.sharafat.xyz/"
```
