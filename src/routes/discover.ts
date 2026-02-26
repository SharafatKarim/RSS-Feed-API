import { Router, Request, Response } from 'express';

const router = Router();

const FETCH_TIMEOUT_MS = parseInt(process.env.FETCH_TIMEOUT_MS ?? '8000', 10);

// MIME types that indicate a feed
const FEED_TYPES = new Set([
    'application/rss+xml',
    'application/atom+xml',
    'application/feed+json',
    'application/x-atom+xml',
    'application/rdf+xml',
    'text/xml',
]);

// Common feed path suffixes to probe as a fallback
const COMMON_PATHS = [
    '/feed',
    '/feed.xml',
    '/rss',
    '/rss.xml',
    '/atom.xml',
    '/index.xml',
    '/feed/index.xml',
    '/blog/feed',
    '/blog/rss',
];

interface DiscoveredFeed {
    url: string;
    title: string;
    type: string;
    source: 'html-link' | 'probe';
}

/**
 * Extract <link rel="alternate"> feed tags from HTML.
 * Avoids a full HTML parser dependency; the patterns are predictable enough for regex.
 */
export function extractFeedLinks(html: string, baseUrl: string): DiscoveredFeed[] {
    const results: DiscoveredFeed[] = [];
    // Match all <link ...> tags (self-closing or not, case-insensitive)
    const linkTagRe = /<link([^>]+)>/gi;
    let match: RegExpExecArray | null;

    while ((match = linkTagRe.exec(html)) !== null) {
        const attrs = match[1];
        const rel = attrValue(attrs, 'rel');
        if (!rel || !rel.toLowerCase().includes('alternate')) continue;

        const type = attrValue(attrs, 'type') ?? '';
        if (!FEED_TYPES.has(type.toLowerCase().split(';')[0].trim())) continue;

        const href = attrValue(attrs, 'href');
        if (!href) continue;

        const title = attrValue(attrs, 'title') ?? type;

        results.push({
            url: toAbsolute(href, baseUrl),
            title,
            type,
            source: 'html-link',
        });
    }

    return results;
}

/** Pull the value of a named attribute from an HTML attribute string. */
function attrValue(attrs: string, name: string): string | undefined {
    const re = new RegExp(`${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i');
    const m = re.exec(attrs);
    return m ? (m[1] ?? m[2] ?? m[3]) : undefined;
}

/** Resolve a potentially relative href against the page's base URL. */
function toAbsolute(href: string, base: string): string {
    try {
        return new URL(href, base).toString();
    } catch {
        return href;
    }
}

/**
 * Probe a URL with a HEAD request to see if it returns a feed content-type.
 * Falls back to a GET for servers that don't support HEAD.
 */
async function probeFeed(url: string): Promise<boolean> {
    const signal = AbortSignal.timeout(FETCH_TIMEOUT_MS);
    try {
        const res = await fetch(url, { method: 'HEAD', signal });
        if (res.ok) {
            const ct = res.headers.get('content-type') ?? '';
            return FEED_TYPES.has(ct.split(';')[0].trim());
        }
    } catch { /* fall through to GET */ }
    try {
        const res = await fetch(url, {
            method: 'GET',
            signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
            headers: { Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml' },
        });
        if (!res.ok) return false;
        const ct = res.headers.get('content-type') ?? '';
        if (FEED_TYPES.has(ct.split(';')[0].trim())) return true;
        // Content-type might be generic text/html — peek at body
        const text = await res.text();
        return text.trimStart().startsWith('<?xml') || /<(rss|feed|rdf)[^>]*>/i.test(text.slice(0, 512));
    } catch {
        return false;
    }
}

/**
 * @openapi
 * /discover:
 *   get:
 *     summary: Discover RSS/Atom feeds on a website
 *     description: >
 *       Fetches the HTML of the given website URL and extracts any RSS/Atom/JSON
 *       feed links declared via `<link rel="alternate">` tags. If none are found,
 *       it falls back to probing common feed paths (e.g. `/feed`, `/rss.xml`).
 *       Also accessible at `/api/discover`.
 *     tags:
 *       - Feed
 *     parameters:
 *       - in: query
 *         name: url
 *         required: true
 *         schema:
 *           type: string
 *           format: uri
 *         description: Homepage or any page URL of the website to inspect.
 *         example: https://blog.sharafat.xyz/
 *     responses:
 *       200:
 *         description: Discovery result (may return an empty `feeds` array if nothing is found).
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/DiscoverResponse'
 *       400:
 *         description: Missing or invalid `url` parameter.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       502:
 *         description: Upstream site returned a non-OK HTTP status.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       504:
 *         description: Request to the upstream site timed out.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Unexpected server error.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/discover', async (req: Request, res: Response): Promise<void> => {
    const raw = req.query['url'];
    const url = typeof raw === 'string' ? raw.replace(/^["']+|["']+$/g, '').trim() : '';

    if (!url) {
        res.status(400).json({ error: 'Missing website URL parameter' });
        return;
    }

    let base: URL;
    try {
        base = new URL(url);
    } catch {
        res.status(400).json({ error: `Invalid URL: ${url}` });
        return;
    }

    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Linkerine/1.0 (Feed Discovery; +https://linkerine.netlify.app)',
                Accept: 'text/html,application/xhtml+xml',
            },
            signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        });

        if (!response.ok) {
            res.status(502).json({
                error: `Site responded with ${response.status} ${response.statusText}`,
            });
            return;
        }

        const html = await response.text();

        // 1️⃣  Parse <link rel="alternate"> tags
        let feeds = extractFeedLinks(html, url);

        // Deduplicate by URL
        const seen = new Set<string>(feeds.map((f) => f.url));

        // 2️⃣  Probe common paths in parallel if no feeds found yet
        if (feeds.length === 0) {
            const origin = base.origin;
            const candidates = COMMON_PATHS.map((p) => origin + p).filter((u) => !seen.has(u));

            const probeResults = await Promise.all(
                candidates.map(async (candidateUrl) => ({
                    candidateUrl,
                    ok: await probeFeed(candidateUrl),
                })),
            );

            for (const { candidateUrl, ok } of probeResults) {
                if (ok && !seen.has(candidateUrl)) {
                    seen.add(candidateUrl);
                    feeds.push({
                        url: candidateUrl,
                        title: candidateUrl.split('/').pop() ?? candidateUrl,
                        type: 'application/rss+xml',
                        source: 'probe',
                    });
                }
            }
        }

        res.json({ url, feeds });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('[discover] Error discovering feeds:', url, message);
        const status = message.includes('timed out') || message.includes('abort') ? 504 : 500;
        res.status(status).json({ error: message });
    }
});

export default router;
