import { getCached, setCache, CacheOptions } from "./cache";

export interface NodeVulnerability {
  cve: string;
  title: string;
  description: string;
  severity: "Critical" | "High" | "Medium" | "Low";
  type: string; // e.g. "HTTP Request Smuggling", "Buffer Overflow", "DNS Rebinding"
  affectedVersions: string; // semver range like ">=18.0.0 <18.19.1"
  patchedIn: string; // version where fix landed
  postUrl: string;
  postDate: string;
}

export interface ScrapedPost {
  url: string;
  title: string;
  date: string;
  vulnerabilities: NodeVulnerability[];
}

const NODE_BLOG_BASE = "https://nodejs.org/en/blog";
const NODE_BLOG_VULN_FEED = "https://nodejs.org/en/blog/vulnerability";

const CACHE_KEY_PREFIX = "node-security-posts";

/**
 * Fetch the list of recent Node.js security release blog post URLs.
 * Returns up to `count` post URLs, most recent first.
 */
export async function fetchSecurityPostUrls(count: number = 5): Promise<string[]> {
  const fetch = (await import("node-fetch")).default;

  // The Node.js blog vulnerability page lists security advisories
  const res = await fetch(NODE_BLOG_VULN_FEED);
  const html = await res.text();

  // Extract post links — they follow a pattern like /en/blog/vulnerability/month-year-security-releases
  const linkPattern = /href="(\/en\/blog\/vulnerability\/[^"]+)"/g;
  const urls: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = linkPattern.exec(html)) !== null && urls.length < count) {
    const fullUrl = `https://nodejs.org${match[1]}`;
    if (!urls.includes(fullUrl)) {
      urls.push(fullUrl);
    }
  }

  return urls;
}

/**
 * Fetch and parse a single Node.js security blog post.
 * Returns raw HTML content for LLM-assisted extraction.
 */
export async function fetchPostContent(url: string): Promise<string> {
  const fetch = (await import("node-fetch")).default;
  const res = await fetch(url);
  return res.text();
}

/**
 * Extract structured vulnerability data from a blog post's HTML.
 *
 * This function does basic regex extraction for well-formatted posts.
 * For ambiguous or inconsistent formatting, the orchestrator should
 * pass the raw HTML to the LLM for structured extraction.
 */
export function extractVulnsFromHtml(
  html: string,
  postUrl: string,
  postDate: string
): NodeVulnerability[] {
  const vulns: NodeVulnerability[] = [];

  // Extract CVEs — most posts list them explicitly
  const cvePattern = /CVE-\d{4}-\d{4,}/g;
  const cves = [...new Set(html.match(cvePattern) || [])];

  // Extract severity indicators
  const severityMap: Record<string, NodeVulnerability["severity"]> = {
    critical: "Critical",
    high: "High",
    medium: "Medium",
    moderate: "Medium",
    low: "Low",
  };

  // Try to extract structured sections for each CVE
  for (const cve of cves) {
    // Find the section around this CVE
    const cveIdx = html.indexOf(cve);
    if (cveIdx === -1) continue;

    // Grab surrounding context (2000 chars around the CVE mention)
    const start = Math.max(0, cveIdx - 500);
    const end = Math.min(html.length, cveIdx + 1500);
    const context = html.slice(start, end);

    // Strip HTML tags for text analysis
    const textContext = context.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

    // Detect severity
    let severity: NodeVulnerability["severity"] = "Medium";
    for (const [keyword, level] of Object.entries(severityMap)) {
      if (textContext.toLowerCase().includes(keyword)) {
        severity = level;
        break;
      }
    }

    // Try to extract version info
    const versionPattern = /(\d+\.\d+\.\d+)/g;
    const versions = textContext.match(versionPattern) || [];

    vulns.push({
      cve,
      title: extractTitle(textContext, cve),
      description: textContext.slice(0, 300).trim(),
      severity,
      type: classifyVulnType(textContext),
      affectedVersions: versions.length > 0 ? `< ${versions[versions.length - 1]}` : "unknown",
      patchedIn: versions.length > 0 ? versions[versions.length - 1] : "unknown",
      postUrl,
      postDate,
    });
  }

  return vulns;
}

/**
 * Attempt to extract a human-readable title near the CVE mention.
 */
function extractTitle(text: string, cve: string): string {
  // Often the title is on the line before or after the CVE
  const lines = text.split(/[.\n]/);
  for (const line of lines) {
    if (line.includes(cve) && line.trim().length > 20) {
      return line.trim().slice(0, 120);
    }
  }
  return cve;
}

/**
 * Basic heuristic classification of vulnerability type.
 * The LLM integration point can refine this significantly.
 */
function classifyVulnType(text: string): string {
  const lower = text.toLowerCase();
  const typeMap: [string, string][] = [
    ["http request smuggling", "HTTP Request Smuggling"],
    ["http smuggling", "HTTP Request Smuggling"],
    ["buffer overflow", "Buffer Overflow"],
    ["buffer over-read", "Buffer Over-read"],
    ["dns rebinding", "DNS Rebinding"],
    ["dns rebind", "DNS Rebinding"],
    ["path traversal", "Path Traversal"],
    ["directory traversal", "Path Traversal"],
    ["denial of service", "Denial of Service"],
    ["denial-of-service", "Denial of Service"],
    ["dos", "Denial of Service"],
    ["prototype pollution", "Prototype Pollution"],
    ["code injection", "Code Injection"],
    ["remote code execution", "Remote Code Execution"],
    ["rce", "Remote Code Execution"],
    ["privilege escalation", "Privilege Escalation"],
    ["permission", "Permission Bypass"],
    ["bypass", "Security Bypass"],
    ["memory leak", "Memory Leak"],
    ["use after free", "Use After Free"],
    ["integer overflow", "Integer Overflow"],
    ["race condition", "Race Condition"],
    ["timing attack", "Timing Attack"],
    ["side channel", "Side Channel Attack"],
    ["certificate", "Certificate Validation"],
    ["tls", "TLS/SSL Issue"],
    ["ssl", "TLS/SSL Issue"],
    ["xss", "Cross-Site Scripting"],
    ["cross-site", "Cross-Site Scripting"],
    ["header injection", "Header Injection"],
    ["crlf", "CRLF Injection"],
    ["regex", "ReDoS"],
    ["redos", "ReDoS"],
  ];

  for (const [pattern, label] of typeMap) {
    if (lower.includes(pattern)) return label;
  }

  return "Other";
}

/**
 * Main entry: scrape the last N Node.js security posts.
 * Uses cache with configurable TTL.
 */
export async function scrapeNodeSecurityPosts(
  count: number = 5,
  cacheOpts: Partial<CacheOptions> = {}
): Promise<ScrapedPost[]> {
  const cacheKey = `${CACHE_KEY_PREFIX}-${count}`;
  const cached = getCached<ScrapedPost[]>(cacheKey, cacheOpts);
  if (cached) {
    console.log(`[cache hit] Using cached Node.js security posts (${cached.length} posts)`);
    return cached;
  }

  console.log(`[fetch] Retrieving last ${count} Node.js security post URLs...`);
  const urls = await fetchSecurityPostUrls(count);
  console.log(`[fetch] Found ${urls.length} security post URLs`);

  const posts: ScrapedPost[] = [];

  for (const url of urls) {
    console.log(`[fetch] Parsing: ${url}`);
    const html = await fetchPostContent(url);

    // Extract date from URL or content
    const dateMatch = url.match(/(\w+-\d{4})/);
    const postDate = dateMatch ? dateMatch[1] : "unknown";

    // Extract title from <title> or <h1>
    const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : url.split("/").pop() || url;

    const vulns = extractVulnsFromHtml(html, url, postDate);

    posts.push({
      url,
      title,
      date: postDate,
      vulnerabilities: vulns,
    });
  }

  setCache(cacheKey, posts, cacheOpts);
  return posts;
}

// CLI entry point
if (require.main === module) {
  const count = parseInt(process.argv[2] || "5", 10);
  scrapeNodeSecurityPosts(count)
    .then((posts) => {
      console.log(JSON.stringify(posts, null, 2));
    })
    .catch((err) => {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    });
}
