# Vulnerability Severity Taxonomy

Reference guide for classifying vulnerabilities extracted from Node.js security
blog posts and other unstructured sources.

## Severity Levels

### Critical (CVSS 9.0–10.0)
Exploitable remotely with no user interaction. Full system compromise likely.
- Remote Code Execution (RCE) with no auth required
- Authentication bypass granting admin access
- Unprotected deserialization leading to arbitrary code execution

### High (CVSS 7.0–8.9)
Significant impact, usually remotely exploitable but may require some conditions.
- HTTP Request Smuggling (can bypass security controls)
- Privilege Escalation (user → admin)
- Server-Side Request Forgery (SSRF) to internal services
- Path Traversal reading sensitive files (e.g. /etc/passwd, .env)

### Medium (CVSS 4.0–6.9)
Moderate impact, often requires specific conditions or user interaction.
- Cross-Site Scripting (XSS) — reflected or stored
- Denial of Service (DoS) via ReDoS or algorithmic complexity
- DNS Rebinding
- Information Disclosure of non-critical data
- Prototype Pollution (in most contexts)

### Low (CVSS 0.1–3.9)
Minimal impact, difficult to exploit, or limited scope.
- Timing attacks with marginal information leakage
- Memory leaks requiring sustained access
- Information disclosure of non-sensitive metadata

## Vulnerability Type Categories

When classifying a vulnerability from unstructured text, assign one of these types:

| Type | Keywords / Patterns |
|------|-------------------|
| HTTP Request Smuggling | "smuggling", "CL-TE", "transfer-encoding" |
| Buffer Overflow | "buffer overflow", "heap overflow", "stack overflow", "out-of-bounds write" |
| Buffer Over-read | "over-read", "out-of-bounds read" |
| DNS Rebinding | "dns rebinding", "dns rebind" |
| Path Traversal | "path traversal", "directory traversal", "../" |
| Denial of Service | "denial of service", "DoS", "crash", "hang", "infinite loop" |
| ReDoS | "regular expression", "ReDoS", "regex", "catastrophic backtracking" |
| Prototype Pollution | "prototype pollution", "__proto__", "constructor.prototype" |
| Code Injection | "code injection", "eval", "arbitrary code" |
| Remote Code Execution | "remote code execution", "RCE" |
| Command Injection | "command injection", "shell injection", "exec", "spawn" |
| Privilege Escalation | "privilege escalation", "elevated permissions" |
| Permission Bypass | "permission bypass", "access control", "authorization" |
| Memory Leak | "memory leak", "OOM" |
| Use After Free | "use after free", "UAF", "dangling pointer" |
| Integer Overflow | "integer overflow", "integer underflow" |
| Race Condition | "race condition", "TOCTOU" |
| Timing Attack | "timing attack", "timing side channel" |
| Side Channel Attack | "side channel", "speculative execution" |
| Certificate Validation | "certificate validation", "X.509", "cert verification" |
| TLS/SSL Issue | "TLS", "SSL", "handshake", "cipher" |
| Cross-Site Scripting | "XSS", "cross-site scripting", "script injection" |
| Header Injection | "header injection", "response splitting" |
| CRLF Injection | "CRLF", "carriage return", "line feed injection" |
| Open Redirect | "open redirect", "URL redirect" |
| SSRF | "SSRF", "server-side request forgery" |
| CSRF | "CSRF", "cross-site request forgery" |
| Information Disclosure | "information disclosure", "data exposure", "sensitive data" |
| Other | (default if no match) |

## LLM Extraction Prompt Template

When the orchestrator needs the LLM to parse an ambiguous blog post section, use
this structure:

```
Given the following HTML excerpt from a Node.js security release blog post,
extract structured vulnerability data:

<excerpt>
{raw_html_content}
</excerpt>

For each vulnerability mentioned, provide:
1. CVE identifier
2. Severity (Critical / High / Medium / Low)
3. Vulnerability type (from the taxonomy above)
4. Affected Node.js version range (semver format)
5. Version where fix was applied
6. One-line description

Return as JSON array.
```
