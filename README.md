# MapleDomains

AI-assisted `.ca` domain finder for Canadian businesses. Built on TanStack Start, deployed on Netlify.

Live at [mapledomains.xyz](https://mapledomains.xyz).

## Stack

- **TanStack Start** (React 19, file-based routing, server functions)
- **Tailwind CSS v4** + shadcn/ui
- **Groq** (Llama 3.3 70B) for AI domain generation — free tier
- **CIRA RDAP** for live `.ca` availability checks
- **Porkbun pricing API** for live registration prices
- **Netlify Functions** for SSR + server-side API calls

## Local development

```bash
npm install
cp .env.example .env   # add your free Groq key from https://console.groq.com/keys
npm run dev
```

Visit http://localhost:5173.

## Deploy to Netlify

### 1. Push to GitHub *(already done)*

### 2. Connect Netlify to the repo

1. [app.netlify.com](https://app.netlify.com) → **Add new site** → **Import an existing project**
2. Connect to GitHub → pick **`Hudsonlatimer/Maple-Domains`**
3. Build settings (auto-detected from `netlify.toml`, no need to override):
   - Build command: `npm run build`
   - Publish directory: `dist/client`
   - Functions directory: `netlify/functions`
4. **Environment variables** (Site settings → Environment variables → **Add a variable**):
   - `GROQ_API_KEY` = your Groq key
   - `GROQ_MODEL` = `llama-3.3-70b-versatile`
5. **Deploy site**

### 3. Custom domain

Site settings → **Domains** → **Add a domain** → `mapledomains.xyz`. DNS at Namecheap is already pointed at Netlify, so it just verifies and provisions HTTPS automatically.

### How it works

`netlify.toml` directs every request to `netlify/functions/server.mjs`, which imports the TanStack Start SSR handler from `dist/server/server.js` and forwards the request. Static client assets are served directly from `dist/client/`. The `[[redirects]]` block uses `force = false` so Netlify serves static files first and only invokes the function when no static match exists.
