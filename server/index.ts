import express from "express";
import rateLimit from "express-rate-limit";
import { createServer } from "http";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SPA_RATE_WINDOW_MS = 60_000;
const SPA_RATE_MAX_REQUESTS = 120;

async function startServer() {
  const app = express();
  app.disable("x-powered-by");
  const server = createServer(app);
  app.use((_req, res, next) => {
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'none'; base-uri 'self'; object-src 'none'; form-action 'self'; script-src 'self'; script-src-attr 'none'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; style-src-attr 'unsafe-inline'; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob:; connect-src https://mempool.space https://mempool.fractalbitcoin.io 'self' https://fractal-ordinal-live.servostar23.workers.dev; manifest-src 'self'; worker-src 'self' blob:; frame-src 'none'; upgrade-insecure-requests"
    );
    res.setHeader(
      "Permissions-Policy",
      "camera=(), microphone=(), geolocation=(), payment=()"
    );
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains"
    );
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    next();
  });

  // Serve static files from dist/public in production
  const staticPath =
    process.env.NODE_ENV === "production"
      ? path.resolve(__dirname, "public")
      : path.resolve(__dirname, "..", "dist", "public");

  app.use(express.static(staticPath));

  const spaRateLimit = rateLimit({
    windowMs: SPA_RATE_WINDOW_MS,
    limit: SPA_RATE_MAX_REQUESTS,
    standardHeaders: "draft-8",
    legacyHeaders: false,
  });

  // Handle client-side routing without swallowing API paths.
  app.get(/^\/(?!api(?:\/|$)).*/, spaRateLimit, (_req, res) => {
    res.sendFile(path.join(staticPath, "index.html"));
  });

  const port = process.env.PORT || 3000;

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
