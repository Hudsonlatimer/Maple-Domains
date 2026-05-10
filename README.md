# MapleDomains

AI-assisted `.ca` domain finder for Canadian businesses. Built on TanStack Start, deployed on Cloudflare Workers.

Live at [mapledomains.xyz](https://mapledomains.xyz).

## Stack

- **TanStack Start** (React 19, file-based routing, server functions)
- **Tailwind CSS v4** + shadcn/ui
- **Groq** (Llama 3.3 70B) for AI domain generation — free tier
- **CIRA RDAP** for live `.ca` availability checks
- **Porkbun pricing API** for live registration prices
- **Cloudflare Workers** runtime

## Local development

```bash
npm install
cp .env.example .env   # add your free Groq key from https://console.groq.com/keys
npm run dev
```

Visit http://localhost:5173.

## Deploy to Cloudflare (one-time setup)

### 1. Push your code to GitHub *(already done)*

### 2. Connect repo to Cloudflare

1. Go to [dash.cloudflare.com](https://dash.cloudflare.com) → sign up if needed (free)
2. Sidebar → **Workers & Pages** → **Create** → **Workers** tab → **Import a repository**
3. Authorize GitHub, pick `Hudsonlatimer/Maple-Domains`
4. Build settings:
   - **Build command:** `npm run build`
   - **Deploy command:** `npx wrangler deploy --config dist/server/wrangler.json`
5. **Variables and Secrets** → add:
   - `GROQ_API_KEY` = your Groq key (mark as Secret)
   - `GROQ_MODEL` = `llama-3.3-70b-versatile`
6. **Create and deploy** — first build takes ~2 min

### 3. Connect your custom domain

1. In your Worker → **Settings** → **Domains & Routes** → **Add Custom Domain**
2. Enter `mapledomains.xyz`
3. Cloudflare will tell you to update DNS — easiest path: **change your nameservers at Namecheap to Cloudflare's** (Cloudflare will provide the two nameservers). After that, Cloudflare manages DNS automatically and the site goes live within ~5 minutes.

## Subsequent deploys

Just push to `main`. Cloudflare will rebuild and redeploy automatically.

```bash
git add -A
git commit -m "..."
git push
```

## Manual deploy (without Git)

```bash
npm run deploy
```

Requires `wrangler login` first.
