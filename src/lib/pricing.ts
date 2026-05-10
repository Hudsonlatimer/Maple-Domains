// Other registrars don't expose public price APIs and aggressively block scraping,
// so we don't fabricate their prices. We link out instead — users see the real
// price on the registrar's own search page (with their domain pre-filled).

export type RegistrarLink = {
  name: string;
  url: (domain: string) => string;
  hint?: string;
};

export const OTHER_REGISTRARS: RegistrarLink[] = [
  {
    name: "Cloudflare",
    url: () => "https://dash.cloudflare.com/?to=/:account/domains/register",
    hint: "at-cost, no markup",
  },
  {
    name: "Namecheap",
    url: (d) => `https://www.namecheap.com/domains/registration/results/?domain=${encodeURIComponent(d)}`,
  },
  {
    name: "Hover",
    url: (d) => `https://www.hover.com/domains/results?q=${encodeURIComponent(d)}`,
  },
  {
    name: "GoDaddy",
    url: (d) => `https://www.godaddy.com/domainsearch/find?domainToCheck=${encodeURIComponent(d)}`,
  },
];

export function porkbunRegisterUrl(domain: string): string {
  return `https://porkbun.com/checkout/search?q=${encodeURIComponent(domain)}`;
}

export function formatUSD(n: number): string {
  return `$${n.toFixed(2)}`;
}
