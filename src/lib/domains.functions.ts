import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

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
// Canadian-flavoured naming dictionary used by the free, no-key generator.
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
    if (r.includes(prov) || tags.some((t) => new RegExp(`\\b${t}\\b`).test(r))) {
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

  // Pattern A: region + category core (highest semantic fit)
  for (const r of regionTokens) {
    for (const w of catWords) {
      push(
        [r, w],
        `Combines ${input.region || "Canadian"} locality with the core "${w}" service term — strong local SEO match.`,
        [`${r} ${w}`, `${w} ${r}`],
        15,
      );
    }
  }

  // Pattern B: region + commerce verb (brandable)
  for (const r of regionTokens) {
    for (const v of COMMERCE_VERBS.slice(0, 4)) {
      push([r, catWords[0] || cat, v], `Brandable triple: locality + service + "${v}".`, [`${r} ${cat}`], 5);
    }
  }

  // Pattern C: northern flavour + category (national reach)
  for (const flav of NORTHERN_FLAVOUR.slice(0, 6)) {
    for (const w of catWords.slice(0, 2)) {
      push(
        [flav, w],
        `National-feel name pairing the Canadian descriptor "${flav}" with "${w}".`,
        [`${flav} ${w}`],
        -5,
      );
    }
  }

  // Pattern D: seed keyword combos
  for (const s of seeds) {
    for (const r of regionTokens.slice(0, 2)) push([r, s], `Targets your seed keyword "${s}" in ${r}.`, [`${r} ${s}`], 8);
    for (const v of COMMERCE_VERBS.slice(0, 2)) push([s, v], `Seed "${s}" + "${v}" — short, memorable.`, [s], 0);
  }

  // Pattern E: pure category brandables (fallback when no region)
  for (const w of catWords) {
    for (const v of COMMERCE_VERBS) {
      push([w, v], `Compact brandable for the ${input.category} category.`, [w, `${w} ${v}`], -10);
    }
  }

  // Shuffle a bit by demand variance, then sort by score desc, take top N+spare
  out.sort((a, b) => b.demandScore - a.demandScore);
  return out.slice(0, Math.max(input.count, 8));
}

// ---------------------------------------------------------------------------
// Groq LLM (free tier). Heuristic generator above is only used as an emergency
// fallback if the Groq call fails (rate limit, network, bad key).
// ---------------------------------------------------------------------------

function buildPrompt(input: z.infer<typeof SearchInput>) {
  const system = `You are a Canadian domain naming strategist. Generate creative, brandable .ca domain names for businesses targeting the Canadian market. Combine local geographic cues (cities, provinces, regional slang like "GTA", "YYC", "Maritime") with high-intent service keywords. Avoid hyphens and numbers. Keep names 6-22 characters before the .ca. Output JSON only.`;

  const user = `Business category: ${input.category}
Region / city focus: ${input.region || "All of Canada"}
Seed keywords (optional): ${input.keywords || "(none)"}
Generate exactly ${input.count} unique .ca domain candidates. For each, estimate Canadian search demand (1-100) based on population, commercial intent, and category competitiveness.

Return strict JSON: {"candidates":[{"domain":"halifaxheat.ca","rationale":"...","keywords":["halifax hvac"],"demandScore":62}]}`;

  return { system, user };
}

function parseAiJson(content: string): AiCandidate[] {
  // Models sometimes wrap JSON in code fences or add prose. Extract the first {...} block.
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

async function callGroq(input: z.infer<typeof SearchInput>): Promise<AiCandidate[]> {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error("GROQ_API_KEY missing");
  const model = process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile";
  const { system, user } = buildPrompt(input);

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      response_format: { type: "json_object" },
      temperature: 0.9,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    if (res.status === 401) throw new Error("Groq auth failed — check GROQ_API_KEY.");
    if (res.status === 429) throw new Error("Groq rate limit — try again in a moment.");
    throw new Error(`Groq ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = await res.json();
  return parseAiJson(data?.choices?.[0]?.message?.content ?? "");
}

async function brainstorm(input: z.infer<typeof SearchInput>): Promise<AiCandidate[]> {
  try {
    const list = await callGroq(input);
    if (list.length > 0) return list;
    console.warn("Groq returned 0 valid candidates — falling back to heuristic.");
  } catch (e) {
    console.warn("Groq call failed, using heuristic:", e instanceof Error ? e.message : e);
  }
  return heuristicFallback(input);
}

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
    const res = await fetch(url, { headers: RDAP_HEADERS });
    if (res.status === 404) return { available: true };
    if (res.status === 403 || res.status === 429 || res.status >= 500) return { kind: "skip" };
    if (!res.ok) return { available: null, error: `RDAP ${res.status}` };
    return parseRdapBody(await res.json());
  } catch {
    return { kind: "skip" };
  }
}

async function checkAvailability(domain: string): Promise<RdapResult> {
  // For .ca, hit CIRA directly (authoritative). Fall back to rdap.org bootstrap.
  // CIRA's official RDAP server (per IANA bootstrap registry).
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

export const searchDomains = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => SearchInput.parse(d))
  .handler(async ({ data }): Promise<{ results: DomainSuggestion[]; price: PorkbunPrice | null }> => {
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

let cachedPrice: PorkbunPrice | null = null;
const PRICE_TTL_MS = 60 * 60 * 1000;

async function getPorkbunCaPrice(): Promise<PorkbunPrice | null> {
  if (cachedPrice && Date.now() - cachedPrice.fetchedAt < PRICE_TTL_MS) return cachedPrice;
  try {
    const res = await fetch("https://api.porkbun.com/api/json/v3/pricing/get");
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
