import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";

const SearchInput = z.object({
  category: z.string().min(2).max(120),
  region: z.string().max(120).optional().default(""),
  keywords: z.string().max(240).optional().default(""),
  count: z.number().int().min(4).max(16).optional().default(10),
});

export type DomainSuggestion = {
  domain: string;
  rationale: string;
  keywords: string[];
  demandScore: number;
  available: boolean | null;
  registrar?: string;
  creationDate?: number;
  error?: string;
};

export type PorkbunPrice = {
  registration: number;
  renewal: number;
  currency: "USD";
  fetchedAt: number;
};

type AiCandidate = {
  domain: string;
  rationale: string;
  keywords: string[];
  demandScore: number;
};

// ---------------------------------------------------------------------------
// Rate limiting — simple in-memory token bucket per server instance
// ---------------------------------------------------------------------------

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 20;
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX) return false;
  entry.count++;
  return true;
}

// ---------------------------------------------------------------------------
// Canadian-flavoured naming dictionary used by the fallback generator.
// ---------------------------------------------------------------------------

const REGION_ALIASES: Record<string, { short: string[]; demand: number }> = {
  toronto: { short: ["yyz", "the6ix", "gta", "tdot"], demand: 95 },
  montreal: { short: ["yul", "mtl"], demand: 88 },
  vancouver: { short: ["yvr", "vancity", "vanc"], demand: 90 },
  calgary: { short: ["yyc", "stampede"], demand: 78 },
  edmonton: { short: ["yeg", "edm"], demand: 72 },
  ottawa: { short: ["yow", "capital"], demand: 70 },
  winnipeg: { short: ["ywg", "thepeg"], demand: 60 },
  quebec: { short: ["yqb", "qcty"], demand: 65 },
  halifax: { short: ["yhz", "hfx"], demand: 58 },
  victoria: { short: ["yyj"], demand: 55 },
  saskatoon: { short: ["yxe"], demand: 48 },
  regina: { short: ["yqr"], demand: 45 },
  hamilton: { short: ["yhm", "thehammer"], demand: 60 },
  london: { short: ["yxu"], demand: 55 },
  kitchener: { short: ["ykf", "kw"], demand: 52 },
  windsor: { short: ["yqg"], demand: 48 },
  kelowna: { short: ["ylw"], demand: 50 },
  burnaby: { short: [], demand: 50 },
  surrey: { short: [], demand: 55 },
  mississauga: { short: ["sauga"], demand: 65 },
  brampton: { short: [], demand: 55 },
  laval: { short: [], demand: 48 },
  yukon: { short: ["yt"], demand: 35 },
};

const PROVINCE_TAGS: Record<string, string[]> = {
  ontario: ["on", "ont"],
  quebec: ["qc", "queb"],
  "british columbia": ["bc"],
  alberta: ["ab", "alta"],
  manitoba: ["mb"],
  saskatchewan: ["sk", "sask"],
  "nova scotia": ["ns"],
  "new brunswick": ["nb"],
  "prince edward island": ["pei"],
  "newfoundland and labrador": ["nl"],
  yukon: ["yt"],
  "northwest territories": ["nwt"],
  nunavut: ["nu"],
  maritimes: ["maritime", "atlantic"],
  prairies: ["prairie"],
};

const NORTHERN_FLAVOUR = ["north", "true", "great", "maple", "polar", "boreal", "pine", "cedar", "evergreen", "loon"];
const COMMERCE_VERBS = ["pro", "co", "hub", "works", "studio", "guild", "house", "lab", "shop", "depot"];

const CATEGORY_KEYWORDS: Record<string, { core: string[]; demand: number }> = {
  hvac: { core: ["heating", "cooling", "furnace", "ac", "heatpump"], demand: 75 },
  plumb: { core: ["plumbing", "drain", "pipe"], demand: 80 },
  electric: { core: ["electric", "wiring", "amp", "volt"], demand: 78 },
  roof: { core: ["roofing", "shingle", "eavestrough"], demand: 72 },
  bake: { core: ["bakery", "loaf", "crumb", "rise"], demand: 55 },
  coffee: { core: ["roast", "brew", "bean", "espresso"], demand: 70 },
  snow: { core: ["snow", "plow", "winter", "shovel"], demand: 68 },
  landscape: { core: ["yard", "garden", "lawn", "green"], demand: 62 },
  tour: { core: ["tour", "trek", "explore", "wander", "trail"], demand: 65 },
  law: { core: ["legal", "law", "counsel", "advocate"], demand: 70 },
  dental: { core: ["dental", "smile", "tooth", "ortho"], demand: 72 },
  fitness: { core: ["fit", "strength", "lift", "move"], demand: 68 },
  yoga: { core: ["yoga", "flow", "mat", "breath"], demand: 58 },
  realestate: { core: ["realty", "homes", "estate", "keys"], demand: 80 },
  marketing: { core: ["brand", "studio", "lab", "agency"], demand: 65 },
  software: { core: ["dev", "code", "stack", "labs"], demand: 70 },
  cleaning: { core: ["clean", "sparkle", "shine", "fresh"], demand: 62 },
  moving: { core: ["movers", "haul", "boxed", "relocate"], demand: 68 },
  pet: { core: ["pet", "paws", "tail", "kennel"], demand: 60 },
  food: { core: ["kitchen", "table", "plate", "feast"], demand: 60 },
};

function slugify(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "");
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function detectCategoryKey(category: string): keyof typeof CATEGORY_KEYWORDS | null {
  const c = category.toLowerCase();
  for (const k of Object.keys(CATEGORY_KEYWORDS) as Array<keyof typeof CATEGORY_KEYWORDS>) {
    if (c.includes(k)) return k;
  }
  if (c.includes("contractor") || c.includes("furnace")) return "hvac";
  if (c.includes("dentist")) return "dental";
  if (c.includes("realtor")) return "realestate";
  if (c.includes("café") || c.includes("cafe")) return "coffee";
  if (c.includes("indigenous") || c.includes("travel") || c.includes("tourism")) return "tour";
  return null;
}

function regionDemand(region: string): { tokens: string[]; demand: number } {
  const r = region.toLowerCase();
  if (!r.trim()) return { tokens: ["canada", "ca", "north"], demand: 55 };

  const tokens: string[] = [];
  let demand = 40;

  for (const [city, info] of Object.entries(REGION_ALIASES)) {
    if (r.includes(city)) {
      tokens.push(slugify(city), ...info.short);
      demand = Math.max(demand, info.demand);
    }
  }
  for (const [prov, tags] of Object.entries(PROVINCE_TAGS)) {
    if (r.includes(prov) || tags.some((t) => new RegExp(`\\b${escapeRegExp(t)}\\b`).test(r))) {
      tokens.push(...tags);
      demand = Math.max(demand, 50);
    }
  }
  if (tokens.length === 0) {
    const first = slugify(r.split(",")[0] || "");
    if (first) tokens.push(first);
    demand = 45;
  }
  return { tokens: Array.from(new Set(tokens)).filter(Boolean), demand };
}

function heuristicFallback(input: z.infer<typeof SearchInput>): AiCandidate[] {
  const cat = slugify(input.category) || "biz";
  const catKey = detectCategoryKey(input.category);
  const catWords = catKey ? CATEGORY_KEYWORDS[catKey].core : [cat.slice(0, 8)];
  const catDemand = catKey ? CATEGORY_KEYWORDS[catKey].demand : 45;

  const { tokens: regionTokens, demand: regionDemandScore } = regionDemand(input.region);
  const seeds = input.keywords
    .split(/[,;\n]/)
    .map((k) => slugify(k))
    .filter((k) => k.length >= 3 && k.length <= 14);

  const out: AiCandidate[] = [];
  const seen = new Set<string>();
  const push = (parts: string[], rationale: string, kwSeed: string[], boost = 0) => {
    const name = parts.filter(Boolean).join("");
    const domain = `${name}.ca`;
    if (name.length < 5 || name.length > 22) return;
    if (seen.has(domain)) return;
    seen.add(domain);
    const score = Math.max(20, Math.min(98, Math.round((regionDemandScore + catDemand) / 2 + boost)));
    out.push({ domain, rationale, keywords: kwSeed.slice(0, 3), demandScore: score });
  };

  for (const r of regionTokens) {
    for (const w of catWords) {
      push([r, w], `Combines ${input.region || "Canadian"} locality with the core "${w}" service term — strong local SEO match.`, [`${r} ${w}`, `${w} ${r}`], 15);
    }
  }
  for (const r of regionTokens) {
    for (const v of COMMERCE_VERBS.slice(0, 4)) {
      push([r, catWords[0] || cat, v], `Brandable triple: locality + service + "${v}".`, [`${r} ${cat}`], 5);
    }
  }
  for (const flav of NORTHERN_FLAVOUR.slice(0, 6)) {
    for (const w of catWords.slice(0, 2)) {
      push([flav, w], `National-feel name pairing the Canadian descriptor "${flav}" with "${w}".`, [`${flav} ${w}`], -5);
    }
  }
  for (const s of seeds) {
    for (const r of regionTokens.slice(0, 2)) push([r, s], `Targets your seed keyword "${s}" in ${r}.`, [`${r} ${s}`], 8);
    for (const v of COMMERCE_VERBS.slice(0, 2)) push([s, v], `Seed "${s}" + "${v}" — short, memorable.`, [s], 0);
  }
  for (const w of catWords) {
    for (const v of COMMERCE_VERBS) {
      push([w, v], `Compact brandable for the ${input.category} category.`, [w, `${w} ${v}`], -10);
    }
  }

  out.sort((a, b) => b.demandScore - a.demandScore);
  return out.slice(0, Math.max(input.count, 8));
}

// ---------------------------------------------------------------------------
// Claude Haiku — domain naming via Anthropic API
// ---------------------------------------------------------------------------

function buildPrompt(input: z.infer<typeof SearchInput>) {
  const system = `You are a Canadian domain naming strategist. Generate creative, brandable .ca domain names for businesses targeting the Canadian market. Combine local geographic cues (cities, provinces, regional slang like "GTA", "YYC", "Maritime") with high-intent service keywords. Avoid hyphens and numbers. Keep names 6-22 characters before the .ca. Output JSON only — no prose, no markdown fences.`;

  const user = `Business category: ${input.category}
Region / city focus: ${input.region || "All of Canada"}
Seed keywords (optional): ${input.keywords || "(none)"}
Generate exactly ${input.count} unique .ca domain candidates. For each, estimate Canadian search demand (1-100) based on population, commercial intent, and category competitiveness.

Return strict JSON: {"candidates":[{"domain":"halifaxheat.ca","rationale":"...","keywords":["halifax hvac"],"demandScore":62}]}`;

  return { system, user };
}

function parseAiJson(content: string): AiCandidate[] {
  let text = content.trim();
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) text = fenced[1].trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) text = text.slice(start, end + 1);

  try {
    const parsed = JSON.parse(text) as { candidates?: AiCandidate[] };
    return (parsed.candidates ?? [])
      .filter((c) => c && typeof c.domain === "string")
      .map((c) => ({
        domain: c.domain.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").trim(),
        rationale: c.rationale ?? "",
        keywords: Array.isArray(c.keywords) ? c.keywords.slice(0, 5) : [],
        demandScore: Math.max(1, Math.min(100, Math.round(Number(c.demandScore) || 30))),
      }))
      .filter((c) => /^[a-z0-9-]+\.ca$/.test(c.domain));
  } catch {
    return [];
  }
}

async function callClaude(input: z.infer<typeof SearchInput>): Promise<AiCandidate[]> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY missing");

  const { system, user } = buildPrompt(input);
  const client = new Anthropic({ apiKey: key });

  const msg = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1024,
    system,
    messages: [{ role: "user", content: user }],
  });

  const text = msg.content?.[0]?.type === "text" ? msg.content[0].text : "";
  return parseAiJson(text);
}

async function brainstorm(input: z.infer<typeof SearchInput>): Promise<AiCandidate[]> {
  try {
    const list = await callClaude(input);
    if (list.length > 0) return list;
    console.warn("Claude returned 0 valid candidates — falling back to heuristic.");
  } catch (e) {
    console.warn("Claude call failed, using heuristic:", e instanceof Error ? e.message : e);
  }
  return heuristicFallback(input);
}

// ---------------------------------------------------------------------------
// RDAP availability checking
// ---------------------------------------------------------------------------

const RDAP_HEADERS = {
  Accept: "application/rdap+json",
  "User-Agent": "MapleDomains/1.0 (+https://mapledomains.xyz)",
};

type RdapResult = Pick<DomainSuggestion, "available" | "registrar" | "creationDate" | "error">;

function parseRdapBody(data: unknown): RdapResult {
  const d = data as {
    entities?: Array<{ roles?: string[]; vcardArray?: unknown[] }>;
    events?: Array<{ eventAction?: string; eventDate?: string }>;
  };
  const registrarEntity = Array.isArray(d?.entities)
    ? d.entities.find((e) => e.roles?.includes("registrar"))
    : null;
  const vcard = registrarEntity?.vcardArray?.[1] as unknown[] | undefined;
  const registrarName = Array.isArray(vcard)
    ? (vcard.find((f) => Array.isArray(f) && (f as unknown[])[0] === "fn") as unknown[] | undefined)?.[3]
    : undefined;
  const regEvent = Array.isArray(d?.events)
    ? d.events.find((e) => e.eventAction === "registration")
    : null;
  const created = regEvent?.eventDate
    ? Math.floor(new Date(regEvent.eventDate).getTime() / 1000)
    : undefined;
  return {
    available: false,
    registrar: typeof registrarName === "string" ? registrarName : undefined,
    creationDate: created,
  };
}

async function tryRdap(url: string): Promise<RdapResult | { kind: "miss" | "skip" }> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, { headers: RDAP_HEADERS, signal: controller.signal });
    clearTimeout(timer);
    if (res.status === 404) return { available: true };
    if (res.status === 403 || res.status === 429 || res.status >= 500) return { kind: "skip" };
    if (!res.ok) return { available: null, error: `RDAP ${res.status}` };
    return parseRdapBody(await res.json());
  } catch {
    return { kind: "skip" };
  }
}

async function checkAvailability(domain: string): Promise<RdapResult> {
  const endpoints = domain.endsWith(".ca")
    ? [
        `https://rdap.ca.fury.ca/rdap/domain/${encodeURIComponent(domain)}`,
        `https://rdap.org/domain/${encodeURIComponent(domain)}`,
      ]
    : [`https://rdap.org/domain/${encodeURIComponent(domain)}`];

  for (const url of endpoints) {
    const result = await tryRdap(url);
    if ("kind" in result) continue;
    return result;
  }
  return { available: null, error: "All RDAP endpoints unreachable" };
}

// ---------------------------------------------------------------------------
// Single-domain quick check
// ---------------------------------------------------------------------------

const CheckInput = z.object({
  domain: z
    .string()
    .min(3)
    .max(63)
    .transform((v) => {
      let d = v.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "");
      if (!d.includes(".")) d = `${d}.ca`;
      return d;
    })
    .refine((v) => /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z]{2,})$/.test(v), {
      message: "Enter a valid domain (e.g. mystore.ca)",
    }),
});

export type QuickCheckResult = {
  domain: string;
  available: boolean | null;
  registrar?: string;
  creationDate?: number;
  error?: string;
  price: PorkbunPrice | null;
};

export const checkDomain = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => CheckInput.parse(d))
  .handler(async ({ data, context }): Promise<QuickCheckResult> => {
    const ip =
      (context as { request?: Request })?.request?.headers?.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    if (!checkRateLimit(ip)) {
      throw new Error("Too many requests — please wait a moment and try again.");
    }
    const [rdap, price] = await Promise.all([checkAvailability(data.domain), getPorkbunCaPrice()]);
    return { domain: data.domain, ...rdap, price };
  });

// ---------------------------------------------------------------------------
// Main server function
// ---------------------------------------------------------------------------

export const searchDomains = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => SearchInput.parse(d))
  .handler(async ({ data, context }): Promise<{ results: DomainSuggestion[]; price: PorkbunPrice | null }> => {
    // Basic rate limiting using request IP
    const ip =
      (context as { request?: Request })?.request?.headers?.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    if (!checkRateLimit(ip)) {
      throw new Error("Too many requests — please wait a moment and try again.");
    }

    const [candidates, price] = await Promise.all([brainstorm(data), getPorkbunCaPrice()]);
    const enriched = await Promise.all(
      candidates.slice(0, data.count).map(async (c) => ({
        ...c,
        ...(await checkAvailability(c.domain)),
      })),
    );
    enriched.sort((a, b) => {
      const av = a.available === true ? 0 : a.available === null ? 1 : 2;
      const bv = b.available === true ? 0 : b.available === null ? 1 : 2;
      if (av !== bv) return av - bv;
      return b.demandScore - a.demandScore;
    });
    return { results: enriched, price };
  });

// ---------------------------------------------------------------------------
// Porkbun pricing (1-hour cache)
// ---------------------------------------------------------------------------

let cachedPrice: PorkbunPrice | null = null;
const PRICE_TTL_MS = 60 * 60 * 1000;

async function getPorkbunCaPrice(): Promise<PorkbunPrice | null> {
  if (cachedPrice && Date.now() - cachedPrice.fetchedAt < PRICE_TTL_MS) return cachedPrice;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch("https://api.porkbun.com/api/json/v3/pricing/get", { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return cachedPrice;
    const data = (await res.json()) as { pricing?: Record<string, { registration?: string; renewal?: string }> };
    const ca = data.pricing?.ca;
    if (!ca?.registration) return cachedPrice;
    cachedPrice = {
      registration: Number(ca.registration),
      renewal: Number(ca.renewal ?? ca.registration),
      currency: "USD",
      fetchedAt: Date.now(),
    };
    return cachedPrice;
  } catch {
    return cachedPrice;
  }
}
