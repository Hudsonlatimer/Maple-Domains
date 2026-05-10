# MapleDomains

AI-assisted `.ca` domain finder for Canadian businesses. Combines an LLM naming strategist with live RDAP availability checks to surface domains that are both available and semantically relevant.

## Stack

- **TanStack Start** (React 19, file-based routing, server functions)
- **Tailwind CSS v4** + shadcn/ui components
- **Zod** for input validation
- **Cloudflare Workers** ready (via `@cloudflare/vite-plugin` + `wrangler`)
- **RDAP** (`rdap.org`) for authoritative domain availability lookups
- **Groq** (free tier, Llama 3.3 70B) for AI-generated names — fast, no credit card
- **Built-in heuristic fallback** so the page never errors if Groq is rate-limited or down (curated dictionary of Canadian regions, IATA codes, province tags, category-specific keyword cores)
- **RDAP** (`rdap.org`) for free, official domain availability lookups

## Local development

```bash
bun install      # or npm / pnpm install
bun run dev
```

Add your free Groq key to a `.env` file:

```bash
# .env
GROQ_API_KEY=gsk_...
GROQ_MODEL=llama-3.3-70b-versatile
```

If Groq is rate-limited, down, or the key is missing, the heuristic engine takes over so the page never errors.

## Build

```bash
bun run build
bun run preview
```

## Deploy (Cloudflare Workers)

```bash
bunx wrangler deploy
```

Set secrets with `wrangler secret put OPENAI_API_KEY`.

## How it works

1. User submits business category + region + optional seed keywords.
2. Server function calls the LLM with a Canadian-naming-strategist system prompt and asks for JSON-shaped candidates.
3. Each candidate is run through RDAP for live availability status (registered date, registrar).
4. Results are sorted by availability, then by estimated Canadian search demand.
