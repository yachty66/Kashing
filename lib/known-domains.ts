/**
 * Fallback name → domain lookup. Used by <Logo /> when the LLM analysis
 * didn't provide a `domain` for a subscription.
 *
 * Entries are matched against the subscription name (case-insensitive,
 * substring) in order — first match wins, so put more specific patterns
 * above their generic siblings (e.g. "amazon prime" before "amazon").
 */
const ENTRIES: Array<{ match: RegExp; domain: string }> = [
  // --- Streaming / media ---
  { match: /netflix/i, domain: "netflix.com" },
  { match: /spotify/i, domain: "spotify.com" },
  { match: /youtube\s*premium|youtube\s*music|youtube/i, domain: "youtube.com" },
  { match: /disney\s*plus|disney\+?/i, domain: "disneyplus.com" },
  { match: /prime\s*video/i, domain: "amazon.com" },
  { match: /amazon\s*prime/i, domain: "amazon.com" },
  { match: /apple\s*tv/i, domain: "apple.com" },
  { match: /apple\s*music/i, domain: "apple.com" },
  { match: /apple\s*one/i, domain: "apple.com" },
  { match: /apple\s*services|apple\.com\/bill|apple/i, domain: "apple.com" },
  { match: /audible/i, domain: "audible.com" },
  { match: /sky\s*(deutschland|de)?/i, domain: "sky.de" },
  { match: /dazn/i, domain: "dazn.com" },
  { match: /paramount/i, domain: "paramountplus.com" },
  { match: /hbo|max/i, domain: "max.com" },
  { match: /hulu/i, domain: "hulu.com" },
  { match: /twitch/i, domain: "twitch.tv" },
  { match: /tidal/i, domain: "tidal.com" },
  { match: /deezer/i, domain: "deezer.com" },
  { match: /nintendo/i, domain: "nintendo.com" },
  { match: /playstation|psn/i, domain: "playstation.com" },
  { match: /xbox/i, domain: "xbox.com" },

  // --- Cloud / infra / dev tools ---
  { match: /aws|amazon\s*web\s*services/i, domain: "aws.amazon.com" },
  { match: /google\s*cloud|gcp/i, domain: "cloud.google.com" },
  { match: /google\s*one/i, domain: "one.google.com" },
  { match: /google\s*workspace|g\s*suite/i, domain: "workspace.google.com" },
  { match: /supabase/i, domain: "supabase.com" },
  { match: /vercel/i, domain: "vercel.com" },
  { match: /netlify/i, domain: "netlify.com" },
  { match: /railway/i, domain: "railway.app" },
  { match: /render/i, domain: "render.com" },
  { match: /fly\.io|fly\b/i, domain: "fly.io" },
  { match: /heroku/i, domain: "heroku.com" },
  { match: /digitalocean/i, domain: "digitalocean.com" },
  { match: /cloudflare/i, domain: "cloudflare.com" },
  { match: /azure/i, domain: "azure.microsoft.com" },
  { match: /github/i, domain: "github.com" },
  { match: /gitlab/i, domain: "gitlab.com" },
  { match: /linear/i, domain: "linear.app" },
  { match: /notion/i, domain: "notion.so" },
  { match: /figma/i, domain: "figma.com" },
  { match: /raycast/i, domain: "raycast.com" },
  { match: /obsidian/i, domain: "obsidian.md" },
  { match: /1password/i, domain: "1password.com" },
  { match: /lastpass/i, domain: "lastpass.com" },
  { match: /bitwarden/i, domain: "bitwarden.com" },
  { match: /dropbox/i, domain: "dropbox.com" },
  { match: /jetbrains/i, domain: "jetbrains.com" },
  { match: /docker/i, domain: "docker.com" },
  { match: /namecheap/i, domain: "namecheap.com" },
  { match: /godaddy/i, domain: "godaddy.com" },
  { match: /openai|chatgpt/i, domain: "openai.com" },
  { match: /anthropic|claude/i, domain: "anthropic.com" },
  { match: /cursor/i, domain: "cursor.com" },
  { match: /perplexity/i, domain: "perplexity.ai" },
  { match: /midjourney/i, domain: "midjourney.com" },
  { match: /openrouter/i, domain: "openrouter.ai" },
  { match: /replicate/i, domain: "replicate.com" },
  { match: /modal/i, domain: "modal.com" },

  // --- Social / SaaS / productivity ---
  { match: /x\s*premium|twitter\s*blue|x\s*corp/i, domain: "x.com" },
  { match: /linkedin/i, domain: "linkedin.com" },
  { match: /slack/i, domain: "slack.com" },
  { match: /zoom/i, domain: "zoom.us" },
  { match: /microsoft\s*365|office\s*365|m365/i, domain: "microsoft.com" },
  { match: /canva/i, domain: "canva.com" },
  { match: /grammarly/i, domain: "grammarly.com" },
  { match: /miro/i, domain: "miro.com" },
  { match: /superhuman/i, domain: "superhuman.com" },
  { match: /readwise/i, domain: "readwise.io" },
  { match: /substack/i, domain: "substack.com" },
  { match: /medium/i, domain: "medium.com" },

  // --- Mobility ---
  { match: /lyft/i, domain: "lyft.com" },
  { match: /uber/i, domain: "uber.com" },
  { match: /bolt/i, domain: "bolt.eu" },
  { match: /lime/i, domain: "li.me" },
  { match: /tier/i, domain: "tier.app" },
  { match: /flixbus|flix/i, domain: "flixbus.com" },
  { match: /db\s*bahn|deutsche\s*bahn/i, domain: "bahn.de" },
  { match: /sbb/i, domain: "sbb.ch" },

  // --- Telco / mobile / internet (DE-heavy) ---
  { match: /sim\.de|drillisch|winsim/i, domain: "sim.de" },
  { match: /vodafone/i, domain: "vodafone.de" },
  { match: /telekom|deutsche\s*telekom/i, domain: "telekom.de" },
  { match: /o2|telef[oó]nica/i, domain: "o2online.de" },
  { match: /1&1|1und1/i, domain: "1und1.de" },
  { match: /congstar/i, domain: "congstar.de" },
  { match: /tello/i, domain: "tello.com" },

  // --- Banking / insurance (DE) ---
  { match: /n26/i, domain: "n26.com" },
  { match: /revolut/i, domain: "revolut.com" },
  { match: /wise/i, domain: "wise.com" },
  { match: /aok/i, domain: "aok.de" },
  { match: /tk|techniker\s*krankenkasse/i, domain: "tk.de" },
  { match: /barmer/i, domain: "barmer.de" },
  { match: /allianz/i, domain: "allianz.de" },
  { match: /huk/i, domain: "huk.de" },
  { match: /clark/i, domain: "clark.de" },
  { match: /finanzguru/i, domain: "finanzguru.de" },

  // --- Hardware / e-commerce / lifestyle ---
  { match: /grover/i, domain: "grover.com" },
  { match: /amazon/i, domain: "amazon.com" }, // generic fallback after prime/web-services
  { match: /ebay/i, domain: "ebay.com" },
  { match: /zalando/i, domain: "zalando.de" },
  { match: /aboalarm/i, domain: "aboalarm.de" },
  { match: /volders/i, domain: "volders.de" },

  // --- Gym / fitness ---
  { match: /crunch/i, domain: "crunch.com" },
  { match: /mcfit|rsg\s*group/i, domain: "mcfit.com" },
  { match: /gold'?s\s*gym/i, domain: "goldsgym.com" },
  { match: /urban\s*sports/i, domain: "urbansportsclub.com" },
  { match: /classpass/i, domain: "classpass.com" },
  { match: /peloton/i, domain: "onepeloton.com" },
  { match: /strava/i, domain: "strava.com" },

  // --- VPN / security ---
  { match: /nord\s*vpn/i, domain: "nordvpn.com" },
  { match: /express\s*vpn/i, domain: "expressvpn.com" },
  { match: /protonvpn|proton\s*vpn|proton\s*mail|proton/i, domain: "proton.me" },
  { match: /mullvad/i, domain: "mullvad.net" },
  { match: /dansvpn|dans\s*vpn/i, domain: "dans.com" },
];

export function lookupDomain(name: string | null | undefined): string | undefined {
  if (!name) return undefined;
  for (const { match, domain } of ENTRIES) {
    if (match.test(name)) return domain;
  }
  return undefined;
}
