import express from 'express';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';
import feedRouter from './routes/feed';
import discoverRouter from './routes/discover';
import { swaggerSpec } from './swagger';

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001;

// ── CORS ────────────────────────────────────────────────────────────────────
const rawAllowlist = process.env.CORS_ALLOWLIST ?? '';
const allowlist = rawAllowlist
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

app.use(
    cors({
        origin(origin, callback) {
            // Allow requests with no origin (e.g. curl, Postman, same-origin SSR)
            if (!origin) return callback(null, true);
            if (allowlist.includes('*') || allowlist.includes(origin)) {
                return callback(null, true);
            }
            callback(new Error(`Origin "${origin}" not allowed by CORS policy`));
        },
        methods: ['GET', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization'],
        optionsSuccessStatus: 204,
    }),
);

// ── Routes ───────────────────────────────────────────────────────────────────
app.use('/api', feedRouter);
app.use('/api', discoverRouter);
app.use('/', feedRouter);    // /feed
app.use('/', discoverRouter); // /discover

/**
 * @openapi
 * /health:
 *   get:
 *     summary: Health check
 *     description: Returns server status and current UTC timestamp.
 *     tags:
 *       - System
 *     responses:
 *       200:
 *         description: Server is healthy.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/HealthResponse'
 */
app.get('/health', (_req, res) => {
    res.json({ status: 'ok', ts: new Date().toISOString() });
});

// ── Swagger UI ───────────────────────────────────────────────────────────────
// Raw OpenAPI spec must be registered BEFORE swagger UI to avoid interception
app.get('/docs/spec.json', (_req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(swaggerSpec);
});

app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
    customSiteTitle: 'Linkerine API Docs',
    swaggerOptions: {
        persistAuthorization: true,
        tryItOutEnabled: true,
    },
}));

// ── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
    console.log(`[linkerine-server] Listening on http://localhost:${PORT}`);
    if (allowlist.length === 0) {
        console.warn('[linkerine-server] CORS_ALLOWLIST is empty – all cross-origin requests will be blocked!');
    } else {
        console.log(`[linkerine-server] CORS allowlist: ${allowlist.join(', ')}`);
    }
});

export default app;
