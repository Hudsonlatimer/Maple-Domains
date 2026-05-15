import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { searchDomains, checkDomain, type DomainSuggestion, type PorkbunPrice, type QuickCheckResult } from "@/lib/domains.functions";
import { OTHER_REGISTRARS, porkbunRegisterUrl, formatUSD } from "@/lib/pricing";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { Bookmark, BookmarkCheck } from "lucide-react";

const STRUCTURED_DATA = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebApplication",
      name: "MapleDomains",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      url: "https://mapledomains.xyz/",
      image: "https://mapledomains.xyz/logo.png",
      description:
        "AI-powered .ca domain name finder for Canadian businesses. Generates available, region-aware domain suggestions with live registry checks and live registrar pricing.",
      offers: { "@type": "Offer", price: "0", priceCurrency: "CAD" },
      inLanguage: "en-CA",
      audience: {
        "@type": "Audience",
        geographicArea: { "@type": "Country", name: "Canada" },
      },
      potentialAction: {
        "@type": "SearchAction",
        target: "https://mapledomains.xyz/?q={search_term_string}",
        "query-input": "required name=search_term_string",
      },
    },
    {
      "@type": "Organization",
      name: "MapleDomains",
      url: "https://mapledomains.xyz/",
      logo: "https://mapledomains.xyz/logo.png",
    },
    {
      "@type": "FAQPage",
      mainEntity: [
        {
          "@type": "Question",
          name: "How does MapleDomains check .ca domain availability?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Each suggestion is verified live against RDAP, the official ICANN-standard replacement for WHOIS.",
          },
        },
        {
          "@type": "Question",
          name: "Is MapleDomains free?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Yes. Domain generation, availability checks, and demand scoring are all free. No account, no credit card.",
          },
        },
      ],
    },
  ],
};

export const Route = createFileRoute("/")({
  component: Index,
  head: () => ({
    meta: [
      { title: "MapleDomains — Find your .ca domain" },
      {
        name: "description",
        content:
          "Find available .ca domains for your Canadian business. AI-suggested names with live availability checks and search-demand scoring. Free, no signup.",
      },
    ],
    links: [
      { rel: "canonical", href: "https://mapledomains.xyz/" },
      { rel: "preconnect", href: "https://rsms.me/" },
      { rel: "stylesheet", href: "https://rsms.me/inter/inter.css" },
    ],
    scripts: [{ type: "application/ld+json", children: JSON.stringify(STRUCTURED_DATA) }],
  }),
});

const FORM_STORAGE_KEY = "mapledomains-form";
const SAVED_STORAGE_KEY = "mapledomains-saved";

const examples = [
  { category: "HVAC contractor", region: "Halifax, NS" },
  { category: "Artisan bakery", region: "Montréal, QC" },
  { category: "Snow removal", region: "Calgary, AB" },
  { category: "Indigenous tourism", region: "Yukon" },
];

function demandLabel(score: number): { label: string; color: string } {
  if (score >= 80) return { label: "High demand", color: "text-success" };
  if (score >= 55) return { label: "Moderate demand", color: "text-warning" };
  return { label: "Niche demand", color: "text-muted-foreground" };
}

function Index() {
  const search = useServerFn(searchDomains);
  const quickCheck = useServerFn(checkDomain);

  // Persist form state across searches
  const [category, setCategory] = useState(() => {
    if (typeof window === "undefined") return "";
    try { return JSON.parse(localStorage.getItem(FORM_STORAGE_KEY) ?? "{}").category ?? ""; } catch { return ""; }
  });
  const [region, setRegion] = useState(() => {
    if (typeof window === "undefined") return "";
    try { return JSON.parse(localStorage.getItem(FORM_STORAGE_KEY) ?? "{}").region ?? ""; } catch { return ""; }
  });
  const [keywords, setKeywords] = useState(() => {
    if (typeof window === "undefined") return "";
    try { return JSON.parse(localStorage.getItem(FORM_STORAGE_KEY) ?? "{}").keywords ?? ""; } catch { return ""; }
  });

  const [quickInput, setQuickInput] = useState("");
  const [quickResult, setQuickResult] = useState<QuickCheckResult | null>(null);

  const quickMutation = useMutation({
    mutationFn: () => quickCheck({ data: { domain: quickInput } }),
    onSuccess: (data) => setQuickResult(data),
    onError: (e: Error) => toast.error(e.message),
  });

  const onQuickSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickInput.trim()) return;
    setQuickResult(null);
    quickMutation.mutate();
  };

  const [results, setResults] = useState<DomainSuggestion[]>([]);
  const [price, setPrice] = useState<PorkbunPrice | null>(null);
  const [saved, setSaved] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try { return JSON.parse(localStorage.getItem(SAVED_STORAGE_KEY) ?? "[]"); } catch { return []; }
  });

  // Keep form synced to localStorage
  useEffect(() => {
    try { localStorage.setItem(FORM_STORAGE_KEY, JSON.stringify({ category, region, keywords })); } catch {}
  }, [category, region, keywords]);

  // Keep saved synced to localStorage
  useEffect(() => {
    try { localStorage.setItem(SAVED_STORAGE_KEY, JSON.stringify(saved)); } catch {}
  }, [saved]);

  const toggleSaved = (domain: string) => {
    setSaved((prev) =>
      prev.includes(domain) ? prev.filter((d) => d !== domain) : [...prev, domain],
    );
  };

  const mutation = useMutation({
    mutationFn: () => search({ data: { category, region, keywords, count: 10 } }),
    onSuccess: (data) => {
      setResults(data.results);
      setPrice(data.price);
      const avail = data.results.filter((r) => r.available === true).length;
      toast.success(`${avail} of ${data.results.length} available`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!category.trim()) {
      toast.error("Tell us what your business does first.");
      return;
    }
    mutation.mutate();
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Toaster richColors position="top-center" />

      {/* Header */}
      <header className="border-b border-border">
        <div className="max-w-4xl mx-auto px-6 h-14 flex items-center justify-between">
          <a href="/" className="flex items-center gap-2 font-semibold tracking-tight text-lg">
            <img src="/logo.png" alt="MapleDomains logo" width={28} height={28} className="rounded-md" />
            <span>
              MapleDomains<span className="text-primary">.xyz</span>
            </span>
          </a>
          <nav className="flex items-center gap-6 text-sm text-muted-foreground">
            {saved.length > 0 && (
              <a href="#saved" className="flex items-center gap-1.5 hover:text-foreground transition-colors">
                <BookmarkCheck className="w-3.5 h-3.5" />
                {saved.length} saved
              </a>
            )}
            <a href="#how" className="hover:text-foreground transition-colors">How it works</a>
            <a href="#faq" className="hover:text-foreground transition-colors">FAQ</a>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero + Form */}
        <section className="max-w-4xl mx-auto px-6 pt-16 pb-12">
          <h1 className="text-4xl md:text-5xl font-semibold tracking-tight leading-[1.1]">
            Find your <span className="text-primary">.ca</span> domain.
          </h1>
          <p className="mt-4 text-lg text-muted-foreground max-w-2xl">
            AI-generated domain ideas for Canadian businesses, checked live against the .ca
            registry. Free to use.
          </p>

          <form
            onSubmit={onSubmit}
            className="mt-10 space-y-5 bg-card border border-border rounded-xl p-6 md:p-8 shadow-sm"
          >
            <div className="grid md:grid-cols-2 gap-5">
              <div className="space-y-1.5">
                <Label htmlFor="category" className="text-sm font-medium">
                  What does your business do?
                </Label>
                <Input
                  id="category"
                  placeholder="HVAC contractor, organic coffee roaster…"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="h-11"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="region" className="text-sm font-medium">
                  Where? <span className="text-muted-foreground font-normal">(optional)</span>
                </Label>
                <Input
                  id="region"
                  placeholder="Halifax, NS"
                  value={region}
                  onChange={(e) => setRegion(e.target.value)}
                  className="h-11"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="kw" className="text-sm font-medium">
                Keywords <span className="text-muted-foreground font-normal">(optional)</span>
              </Label>
              <Textarea
                id="kw"
                rows={2}
                placeholder="furnace repair, ductless heat pump, emergency heating"
                value={keywords}
                onChange={(e) => setKeywords(e.target.value)}
                className="resize-none"
              />
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <Button type="submit" size="lg" disabled={mutation.isPending} className="h-11 px-6">
                {mutation.isPending ? (
                  <span className="flex items-center gap-2">
                    <Spinner /> Searching…
                  </span>
                ) : (
                  "Find domains"
                )}
              </Button>
              <span className="text-sm text-muted-foreground ml-auto">Try an example:</span>
              <div className="flex flex-wrap gap-2 w-full md:w-auto">
                {examples.map((ex) => (
                  <button
                    key={ex.category}
                    type="button"
                    onClick={() => {
                      setCategory(ex.category);
                      setRegion(ex.region);
                      setKeywords("");
                    }}
                    className="text-sm px-3 py-1.5 rounded-full border border-border bg-background hover:bg-secondary transition-colors"
                  >
                    {ex.category}
                  </button>
                ))}
              </div>
            </div>
          </form>
        </section>

        {/* Results */}
        <section className="max-w-4xl mx-auto px-6 pb-20">
          {mutation.isPending && <SkeletonList />}
          {!mutation.isPending && results.length === 0 && <EmptyState />}
          {!mutation.isPending && results.length > 0 && (
            <div>
              <ResultsHeader results={results} price={price} />
              <div className="space-y-3">
                {results.map((r) => (
                  <ResultCard
                    key={r.domain}
                    r={r}
                    price={price}
                    isSaved={saved.includes(r.domain)}
                    onToggleSave={() => toggleSaved(r.domain)}
                  />
                ))}
              </div>
            </div>
          )}
        </section>

        {/* Quick availability check */}
        <section className="max-w-4xl mx-auto px-6 pb-12">
          <div className="bg-card border border-border rounded-xl p-6">
            <h2 className="text-base font-semibold mb-1">Already have a name in mind?</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Type any domain to check if it&rsquo;s available — no AI needed.
            </p>
            <form onSubmit={onQuickSubmit} className="flex gap-2">
              <Input
                placeholder="mystore.ca"
                value={quickInput}
                onChange={(e) => setQuickInput(e.target.value)}
                className="h-10 flex-1 font-mono text-sm"
                autoComplete="off"
                spellCheck={false}
              />
              <Button type="submit" disabled={quickMutation.isPending} className="h-10 px-5 shrink-0">
                {quickMutation.isPending ? <Spinner /> : "Check"}
              </Button>
            </form>

            {quickResult && (
              <QuickResult
                result={quickResult}
                isSaved={saved.includes(quickResult.domain)}
                onToggleSave={() => toggleSaved(quickResult.domain)}
              />
            )}
          </div>
        </section>

        {/* Saved domains */}
        {saved.length > 0 && (
          <section id="saved" className="border-t border-border bg-card">
            <div className="max-w-4xl mx-auto px-6 py-12">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold tracking-tight">Saved domains</h2>
                <button
                  type="button"
                  onClick={() => setSaved([])}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Clear all
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {saved.map((domain) => (
                  <div
                    key={domain}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-border bg-background text-sm"
                  >
                    <span>{domain}</span>
                    <a
                      href={porkbunRegisterUrl(domain)}
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary text-xs hover:underline"
                    >
                      Register ↗
                    </a>
                    <button
                      type="button"
                      onClick={() => toggleSaved(domain)}
                      className="text-muted-foreground hover:text-foreground ml-1"
                      aria-label={`Remove ${domain} from saved`}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* How it works */}
        <section id="how" className="border-t border-border bg-card">
          <div className="max-w-4xl mx-auto px-6 py-16">
            <h2 className="text-2xl font-semibold tracking-tight mb-10">How it works</h2>
            <div className="grid md:grid-cols-3 gap-8">
              <Step
                num="1"
                title="Describe your business"
                body="Tell us your category and region. Optionally add seed keywords for more specific suggestions."
              />
              <Step
                num="2"
                title="AI generates names"
                body="Claude combines your details with Canadian geographic cues to brainstorm 10 brandable .ca domains."
              />
              <Step
                num="3"
                title="Each one is verified live"
                body="Every suggestion is checked against CIRA's official registry. You see availability, registrar, and demand score instantly."
              />
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="border-t border-border">
          <div className="max-w-4xl mx-auto px-6 py-16">
            <h2 className="text-2xl font-semibold tracking-tight mb-10">Questions</h2>
            <div className="grid md:grid-cols-2 gap-x-12 gap-y-8">
              <Faq q="Is the domain mine if it shows as available?">
                Available means no one has registered it yet. To claim it, register through any
                CIRA-accredited registrar (Namecheap, Hover, Porkbun, etc.). MapleDomains
                doesn&rsquo;t take a cut.
              </Faq>
              <Faq q="What does the demand score mean?">
                A 1–100 estimate of Canadian search volume and commercial intent.{" "}
                <strong>80+</strong> is high demand, <strong>55–79</strong> is moderate,{" "}
                <strong>below 55</strong> is niche. Higher demand means more competition too —
                balance it with availability.
              </Faq>
              <Faq q="Why does one say 'Unknown'?">
                The CIRA registry temporarily couldn&rsquo;t be reached (usually a rate limit on
                their end). Run the search again and it almost always resolves. It does{" "}
                <em>not</em> mean the domain is taken.
              </Faq>
              <Faq q="Do you store my searches?">
                No. There&rsquo;s no database, no analytics, no account. Queries hit the AI and
                the registry, then disappear. Saved domains stay in your browser only.
              </Faq>
              <Faq q="Where does the price come from?">
                The headline price is fetched live from Porkbun&rsquo;s public pricing API on
                every search (cached for an hour). Other registrars link out — click through to see
                their current rate. No affiliate links.
              </Faq>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="max-w-4xl mx-auto px-6 py-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-2 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <img src="/logo.png" alt="" width={20} height={20} className="rounded" />
            <span className="font-semibold text-foreground">MapleDomains.xyz</span>
            <span className="text-muted-foreground/70">· Built for Canadian founders</span>
          </div>
          <div>© {new Date().getFullYear()}</div>
        </div>
      </footer>
    </div>
  );
}

function ResultsHeader({
  results,
  price,
}: {
  results: DomainSuggestion[];
  price: PorkbunPrice | null;
}) {
  const avail = results.filter((r) => r.available === true).length;
  return (
    <div className="flex items-baseline justify-between mb-5 flex-wrap gap-2">
      <h2 className="text-xl font-semibold tracking-tight">Suggestions</h2>
      <div className="flex items-center gap-4 text-sm text-muted-foreground">
        {price && (
          <span>
            Lowest .ca:{" "}
            <span className="text-foreground font-medium tabular-nums">
              {formatUSD(price.registration)}
            </span>{" "}
            <span className="text-muted-foreground/70">USD/yr · Porkbun</span>
          </span>
        )}
        <span>
          <span className="text-success font-medium">{avail}</span> of {results.length} available
        </span>
      </div>
    </div>
  );
}

function ResultCard({
  r,
  price,
  isSaved,
  onToggleSave,
}: {
  r: DomainSuggestion;
  price: PorkbunPrice | null;
  isSaved: boolean;
  onToggleSave: () => void;
}) {
  const status =
    r.available === true ? "available" : r.available === false ? "taken" : "unknown";
  const showPricing = r.available === true;
  const { label: dLabel, color: dColor } = demandLabel(r.demandScore);

  return (
    <div className="bg-card border border-border rounded-xl p-5 hover:border-foreground/20 transition-colors">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <a
              href={`https://${r.domain}`}
              target="_blank"
              rel="noreferrer"
              className="text-xl font-semibold hover:text-primary transition-colors"
            >
              {r.domain}
            </a>
            <StatusBadge status={status} />
          </div>
          <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{r.rationale}</p>
          {r.registrar && (
            <p className="mt-1.5 text-xs text-muted-foreground">
              Registered with{" "}
              <span className="text-foreground/80">{r.registrar}</span>
              {r.creationDate ? ` since ${new Date(r.creationDate * 1000).getFullYear()}` : ""}
            </p>
          )}
          {r.error && !r.registrar && (
            <p className="mt-1.5 text-xs text-warning">{r.error}</p>
          )}
        </div>

        <div className="flex items-start gap-3 shrink-0">
          <div className="text-right">
            <div className="text-2xl font-semibold tabular-nums">{r.demandScore}</div>
            <div className={`text-xs ${dColor}`}>{dLabel}</div>
          </div>
          <button
            type="button"
            onClick={onToggleSave}
            aria-label={isSaved ? `Remove ${r.domain} from saved` : `Save ${r.domain}`}
            className="mt-1 text-muted-foreground hover:text-foreground transition-colors"
          >
            {isSaved ? (
              <BookmarkCheck className="w-4 h-4 text-primary" />
            ) : (
              <Bookmark className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>

      {showPricing && <PricingRow domain={r.domain} price={price} />}

      {r.keywords.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {r.keywords.map((k) => (
            <span
              key={k}
              className="text-xs px-2 py-0.5 rounded-md bg-secondary text-secondary-foreground"
            >
              {k}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function QuickResult({
  result,
  isSaved,
  onToggleSave,
}: {
  result: QuickCheckResult;
  isSaved: boolean;
  onToggleSave: () => void;
}) {
  const status = result.available === true ? "available" : result.available === false ? "taken" : "unknown";
  return (
    <div className="mt-4 pt-4 border-t border-border">
      <div className="flex items-center gap-3 flex-wrap">
        <a
          href={`https://${result.domain}`}
          target="_blank"
          rel="noreferrer"
          className="text-lg font-semibold font-mono hover:text-primary transition-colors"
        >
          {result.domain}
        </a>
        <StatusBadge status={status} />
        <button
          type="button"
          onClick={onToggleSave}
          aria-label={isSaved ? `Remove ${result.domain} from saved` : `Save ${result.domain}`}
          className="ml-auto text-muted-foreground hover:text-foreground transition-colors"
        >
          {isSaved ? <BookmarkCheck className="w-4 h-4 text-primary" /> : <Bookmark className="w-4 h-4" />}
        </button>
      </div>

      {result.available === false && result.registrar && (
        <p className="mt-1.5 text-xs text-muted-foreground">
          Registered with <span className="text-foreground/80">{result.registrar}</span>
          {result.creationDate ? ` since ${new Date(result.creationDate * 1000).getFullYear()}` : ""}
        </p>
      )}

      {result.available === true && (
        <div className="mt-3 flex items-center gap-3 flex-wrap">
          {result.price ? (
            <span className="text-sm text-muted-foreground">
              From{" "}
              <span className="text-foreground font-semibold tabular-nums">
                {formatUSD(result.price.registration)}
              </span>{" "}
              USD/yr · Porkbun
            </span>
          ) : null}
          <a
            href={porkbunRegisterUrl(result.domain)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-sm font-medium px-3 py-1.5 rounded-md bg-foreground text-background hover:opacity-90 transition-opacity"
          >
            Register ↗
          </a>
        </div>
      )}
    </div>
  );
}

function PricingRow({ domain, price }: { domain: string; price: PorkbunPrice | null }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-4 pt-4 border-t border-border">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-baseline gap-2">
          {price ? (
            <>
              <span className="text-xs text-muted-foreground">From</span>
              <span className="text-lg font-semibold tabular-nums">
                {formatUSD(price.registration)}
              </span>
              <span className="text-xs text-muted-foreground">USD/yr · Porkbun (live)</span>
            </>
          ) : (
            <span className="text-xs text-muted-foreground">Live pricing unavailable</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            aria-expanded={open}
          >
            {open ? "Hide" : "Other registrars"}
          </button>
          <a
            href={porkbunRegisterUrl(domain)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-sm font-medium px-3 py-1.5 rounded-md bg-foreground text-background hover:opacity-90 transition-opacity"
          >
            Register
            <span className="text-xs">↗</span>
          </a>
        </div>
      </div>
      {open && (
        <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
          {OTHER_REGISTRARS.map((alt) => (
            <a
              key={alt.name}
              href={alt.url(domain)}
              target="_blank"
              rel="noreferrer"
              className="flex flex-col items-start text-sm px-3 py-2 rounded-md border border-border hover:border-foreground/20 hover:bg-secondary/50 transition-colors"
            >
              <span className="font-medium">{alt.name}</span>
              {alt.hint && <span className="text-[10px] text-muted-foreground">{alt.hint}</span>}
              <span className="text-[11px] text-muted-foreground/70 mt-0.5">
                See price ↗
              </span>
            </a>
          ))}
          <p className="col-span-full text-[11px] text-muted-foreground/70 mt-1">
            Live price shown for Porkbun only. Other registrars don&rsquo;t expose prices
            programmatically — click through to see the current rate. Not affiliate links.
          </p>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: "available" | "taken" | "unknown" }) {
  const styles = {
    available: "bg-success/10 text-success border-success/20",
    taken: "bg-secondary text-muted-foreground border-border",
    unknown: "bg-warning/10 text-warning border-warning/20",
  }[status];
  const label = { available: "Available", taken: "Taken", unknown: "Unknown — retry" }[status];
  const title = status === "unknown" ? "Registry temporarily unreachable. Re-run the search to check again." : undefined;
  return (
    <span title={title} className={`text-xs font-medium px-2 py-0.5 rounded-md border cursor-default ${styles}`}>
      {label}
    </span>
  );
}

function Step({ num, title, body }: { num: string; title: string; body: string }) {
  return (
    <div>
      <div className="w-8 h-8 rounded-full bg-primary/10 text-primary font-semibold flex items-center justify-center mb-4">
        {num}
      </div>
      <h3 className="font-semibold mb-2">{title}</h3>
      <p className="text-sm text-muted-foreground leading-relaxed">{body}</p>
    </div>
  );
}

function Faq({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="font-semibold mb-2">{q}</h3>
      <p className="text-sm text-muted-foreground leading-relaxed">{children}</p>
    </div>
  );
}

function SkeletonList() {
  return (
    <div className="space-y-3">
      <div className="h-7 w-40 bg-secondary rounded-md animate-pulse mb-5" />
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="bg-card border border-border rounded-xl p-5 animate-pulse">
          <div className="h-6 w-56 bg-secondary rounded-md mb-3" />
          <div className="h-3 w-full max-w-md bg-secondary rounded-md" />
        </div>
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="text-center py-16 border border-dashed border-border rounded-xl bg-card">
      <p className="text-lg font-medium">Tell us about your business</p>
      <p className="mt-1 text-sm text-muted-foreground">
        We&rsquo;ll find ten available .ca domains in seconds.
      </p>
    </div>
  );
}

function Spinner() {
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4 animate-spin" fill="none">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path
        d="M12 2 a10 10 0 0 1 10 10"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}
