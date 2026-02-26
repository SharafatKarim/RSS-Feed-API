import app from './app';

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001;

const rawAllowlist = process.env.CORS_ALLOWLIST ?? '';
const allowlist = rawAllowlist.split(',').map((o) => o.trim()).filter(Boolean);

app.listen(PORT, () => {
    console.log(`[linkerine-server] Listening on http://localhost:${PORT}`);
    if (allowlist.length === 0) {
        console.warn('[linkerine-server] CORS_ALLOWLIST is empty – all cross-origin requests will be blocked!');
    } else {
        console.log(`[linkerine-server] CORS allowlist: ${allowlist.join(', ')}`);
    }
});
