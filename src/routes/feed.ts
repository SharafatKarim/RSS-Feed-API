import { Router, Request, Response } from 'express';
import { XMLParser } from 'fast-xml-parser';
import { extractFeedLinks } from './discover';

const router = Router();

/**
 * @openapi
 * /feed:
 *   get:
 *     summary: Fetch and parse an RSS or Atom feed
 *     description: >
 *       Proxies a remote RSS/Atom feed URL, parses the XML, and returns a
 *       normalised JSON array of articles. Supports both RSS 2.0 and Atom 1.0.
 *       Also accessible at `/api/feed`.
 *     tags:
 *       - Feed
 *     parameters:
 *       - in: query
 *         name: url
 *         required: true
 *         schema:
 *           type: string
 *           format: uri
 *         description: The full URL of the RSS or Atom feed to fetch.
 *         example: https://blog.sharafat.xyz/index.xml
 *     responses:
 *       200:
 *         description: Successfully parsed feed.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/FeedResponse'
 *       400:
 *         description: Missing or invalid `url` parameter.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       502:
 *         description: Upstream feed returned a non-OK HTTP status.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       504:
 *         description: Request to the upstream feed timed out (> 8 s).
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

// Reusable parser instance – created once, not per-request
const xmlParser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    textNodeName: '#text',
    cdataPropName: '__cdata',
});

const FETCH_TIMEOUT_MS = parseInt(process.env.FETCH_TIMEOUT_MS ?? '8000', 10);

// ── Helpers ──────────────────────────────────────────────────────────────────

function extractText(node: unknown): string {
    if (!node) return '';
    if (typeof node === 'string') return node;
    if (typeof node === 'number' || typeof node === 'boolean') return String(node);
    if (typeof node === 'object' && node !== null) {
        const n = node as Record<string, unknown>;
        if (n['__cdata']) return String(n['__cdata']);
        if (n['#text']) return String(n['#text']);
    }
    return String(node);
}

function extractLink(item: Record<string, unknown>): string {
    const raw = item['link'];
    if (typeof raw === 'string') return raw;
    if (raw && typeof raw === 'object') {
        const obj = raw as Record<string, unknown>;
        if (typeof obj['@_href'] === 'string') return obj['@_href'];
    }
    // Atom feeds sometimes have multiple <link> elements as an array
    if (Array.isArray(raw)) {
        for (const l of raw as unknown[]) {
            if (typeof l === 'object' && l !== null) {
                const lo = l as Record<string, unknown>;
                if (lo['@_rel'] === 'alternate' || !lo['@_rel']) {
                    const href = lo['@_href'];
                    if (typeof href === 'string') return href;
                }
            }
        }
    }
    return '';
}

// ── GET /api/feed?url=<feedUrl> ──────────────────────────────────────────────

async function fetchAndParseFeed(req: Request, res: Response): Promise<void> {
    // Strip accidental surrounding quotes (e.g. "%22https://...%22" from some clients)
    const url = typeof req.query['url'] === 'string'
        ? req.query['url'].replace(/^["']+|["']+$/g, '').trim()
        : '';

    if (!url) {
        res.status(400).json({ error: 'Missing feed URL parameter' });
        return;
    }

    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'User-Agent': 'Linkerine/1.0 (RSS Reader Context; +https://linkerine.netlify.app)',
                Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml',
            },
            signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        });

        if (!response.ok) {
            res.status(502).json({
                error: `Upstream feed responded with ${response.status} ${response.statusText}`,
            });
            return;
        }

        const xmlText = await response.text();

        // ── Auto-detect HTML → run discovery and re-fetch the real feed ──
        const contentType = response.headers.get('content-type') ?? '';
        const isHtml = contentType.includes('text/html') || xmlText.trimStart().startsWith('<!');
        if (isHtml) {
            const discovered = extractFeedLinks(xmlText, url);
            if (discovered.length === 0) {
                res.status(422).json({
                    error: 'No RSS/Atom feed found on that page. Try passing the feed URL directly, or use /discover first.',
                });
                return;
            }
            // Transparently re-fetch using the first discovered feed URL
            req.query['url'] = discovered[0].url;
            await fetchAndParseFeed(req, res);
            return;
        }
        const parsed = xmlParser.parse(xmlText) as Record<string, unknown>;

        // ── Normalise RSS vs Atom ─────────────────────────────────────────
        type RawItem = Record<string, unknown>;
        let rawItems: RawItem[] = [];
        let feedTitle = url;

        if (parsed['rss']) {
            const channel = (parsed['rss'] as Record<string, unknown>)['channel'] as Record<string, unknown>;
            feedTitle = extractText(channel['title']);
            const item = channel['item'];
            rawItems = Array.isArray(item) ? (item as RawItem[]) : item ? [item as RawItem] : [];
        } else if (parsed['feed']) {
            const feed = parsed['feed'] as Record<string, unknown>;
            feedTitle = extractText(feed['title']);
            const entry = feed['entry'];
            rawItems = Array.isArray(entry) ? (entry as RawItem[]) : entry ? [entry as RawItem] : [];
        }

        // ── Map to normalised Article schema ──────────────────────────────
        const articles = rawItems
            .map((item) => {
                const title = extractText(item['title']);
                const link = extractLink(item);
                const pubDateRaw = extractText(
                    (item['pubDate'] ?? item['published'] ?? item['updated']) as unknown,
                );
                const pubDate = pubDateRaw && !isNaN(Date.parse(pubDateRaw))
                    ? new Date(pubDateRaw).toISOString()
                    : new Date().toISOString();
                const content = extractText(
                    (item['content:encoded'] ?? item['content'] ?? item['description']) as unknown,
                );

                return {
                    id: link || title,
                    title,
                    link,
                    pubDate,
                    contentSnippet: content.substring(0, 300) + (content.length > 300 ? '...' : ''),
                    content,
                };
            })
            .filter((a) => a.link && a.title);

        res.json({ feedTitle, articles });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('[feed] Error syncing feed:', url, message);
        const status = message.includes('timed out') || message.includes('abort') ? 504 : 500;
        res.status(status).json({ error: message });
    }
}

router.get('/feed', fetchAndParseFeed);

export default router;
