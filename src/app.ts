import express from 'express';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';
import feedRouter from './routes/feed';
import discoverRouter from './routes/discover';
import { swaggerSpec } from './swagger';

const app = express();

// ── CORS ────────────────────────────────────────────────────────────────────
const rawAllowlist = process.env.CORS_ALLOWLIST ?? '';
const allowlist = rawAllowlist
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

app.use(
    cors({
        origin(origin, callback) {
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
app.use('/', feedRouter);
app.use('/', discoverRouter);

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

export default app;
