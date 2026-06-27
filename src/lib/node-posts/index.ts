import type { CacheOptions } from 'lib/cache';
import { getCached, setCache } from 'lib/cache';

export interface NodeVulnerability {
  cve: string;
  title: string;
  description: string;
  severity: 'Critical' | 'High' | 'Medium' | 'Low';
  type: string;
  affectedVersions: string;
  patchedIn: string;
  postUrl: string;
  postDate: string;
}

export interface ScrapedPost {
  url: string;
  title: string;
  date: string;
  vulnerabilities: NodeVulnerability[];
}

const NODE_BLOG_VULN_FEED = 'https://nodejs.org/en/blog/vulnerability';
const CACHE_KEY_PREFIX = 'node-security-posts';

export async function fetchSecurityPostUrls(count: number = 5): Promise<string[]> {
  const fetch = (await import('node-fetch')).default;

  const res = await fetch(NODE_BLOG_VULN_FEED);
  const html = await res.text();

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

export async function fetchPostContent(url: string): Promise<string> {
  const fetch = (await import('node-fetch')).default;
  const res = await fetch(url);
  return res.text();
}

export function extractVulnsFromHtml(html: string, postUrl: string, postDate: string): NodeVulnerability[] {
  const vulns: NodeVulnerability[] = [];
  const cvePattern = /CVE-\d{4}-\d{4,}/g;
  const cves = [...new Set(html.match(cvePattern) || [])];

  const severityMap: Record<string, NodeVulnerability['severity']> = {
    critical: 'Critical',
    high: 'High',
    medium: 'Medium',
    moderate: 'Medium',
    low: 'Low',
  };

  for (const cve of cves) {
    const cveIdx = html.indexOf(cve);
    if (cveIdx === -1) continue;

    const start = Math.max(0, cveIdx - 500);
    const end = Math.min(html.length, cveIdx + 1500);
    const context = html.slice(start, end);
    const textContext = context.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

    let severity: NodeVulnerability['severity'] = 'Medium';
    for (const [keyword, level] of Object.entries(severityMap)) {
      if (textContext.toLowerCase().includes(keyword)) {
        severity = level;
        break;
      }
    }

    const versionPattern = /(\d+\.\d+\.\d+)/g;
    const versions = textContext.match(versionPattern) || [];

    vulns.push({
      cve,
      title: extractTitle(textContext, cve),
      description: textContext.slice(0, 300).trim(),
      severity,
      type: classifyVulnType(textContext),
      affectedVersions: versions.length > 0 ? `< ${versions[versions.length - 1]}` : 'unknown',
      patchedIn: versions.length > 0 ? versions[versions.length - 1] : 'unknown',
      postUrl,
      postDate,
    });
  }

  return vulns;
}

function extractTitle(text: string, cve: string): string {
  const lines = text.split(/[.\n]/);
  for (const line of lines) {
    if (line.includes(cve) && line.trim().length > 20) {
      return line.trim().slice(0, 120);
    }
  }
  return cve;
}

function classifyVulnType(text: string): string {
  const lower = text.toLowerCase();
  const typeMap: Array<[string, string]> = [
    ['http request smuggling', 'HTTP Request Smuggling'],
    ['http smuggling', 'HTTP Request Smuggling'],
    ['buffer overflow', 'Buffer Overflow'],
    ['buffer over-read', 'Buffer Over-read'],
    ['dns rebinding', 'DNS Rebinding'],
    ['dns rebind', 'DNS Rebinding'],
    ['path traversal', 'Path Traversal'],
    ['directory traversal', 'Path Traversal'],
    ['denial of service', 'Denial of Service'],
    ['denial-of-service', 'Denial of Service'],
    ['dos', 'Denial of Service'],
    ['prototype pollution', 'Prototype Pollution'],
    ['code injection', 'Code Injection'],
    ['remote code execution', 'Remote Code Execution'],
    ['rce', 'Remote Code Execution'],
    ['privilege escalation', 'Privilege Escalation'],
    ['permission', 'Permission Bypass'],
    ['bypass', 'Security Bypass'],
    ['memory leak', 'Memory Leak'],
    ['use after free', 'Use After Free'],
    ['integer overflow', 'Integer Overflow'],
    ['race condition', 'Race Condition'],
    ['timing attack', 'Timing Attack'],
    ['side channel', 'Side Channel Attack'],
    ['certificate', 'Certificate Validation'],
    ['tls', 'TLS/SSL Issue'],
    ['ssl', 'TLS/SSL Issue'],
    ['xss', 'Cross-Site Scripting'],
    ['cross-site', 'Cross-Site Scripting'],
    ['header injection', 'Header Injection'],
    ['crlf', 'CRLF Injection'],
    ['regex', 'ReDoS'],
    ['redos', 'ReDoS'],
  ];

  for (const [pattern, label] of typeMap) {
    if (lower.includes(pattern)) return label;
  }

  return 'Other';
}

export async function scrapeNodeSecurityPosts(
  count: number = 5,
  cacheOpts: Partial<CacheOptions> = {},
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

    const dateMatch = url.match(/(\w+-\d{4})/);
    const postDate = dateMatch ? dateMatch[1] : 'unknown';

    const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : url.split('/').pop() || url;

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
