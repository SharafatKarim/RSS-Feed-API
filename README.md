# linkerine-server

Lightweight Express.js API that fetches, parses, and normalises RSS/Atom feeds into a consistent JSON schema. Also discovers feed URLs from any website.

> To test the API, use the following site, (`/docs` won't work),
>
> - <https://linkerine.netlify.app/>

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

## Deploy to Netlify

1. Install [Netlify CLI](https://docs.netlify.com/cli/get-started/):

   ```bash
   npm install netlify-cli -g
   ```

2. Initialise and deploy:

   ```bash
   netlify init   # follow prompts — build command: pnpm build, publish dir: public
   netlify deploy --prod
   ```

3. Set environment variables in the Netlify dashboard or via CLI:

   ```bash
   netlify env:set CORS_ALLOWLIST "https://linkerine.app"
   ```

After deploy all routes are available at `https://<your-site>.netlify.app/`
(e.g. `/feed`, `/discover`, `/docs`).
