import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

// ✅ ES modülü için `__dirname` tanımla
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ✅ `.env` dosyasının gerçekten doğru yerden yüklendiğini kontrol et
const dotenvPath = path.resolve(__dirname, "../.env");
console.log("📢 Yüklenmesi gereken .env yolu:", dotenvPath);

const result = dotenv.config({ path: dotenvPath });

if (result.error) {
  console.error("❌ .env dosyası yüklenirken hata oluştu:", result.error);
} else {
  console.log("✅ .env dosyası başarıyla yüklendi!");
}

// ✅ Değişkenlerin gerçekten yüklenip yüklenmediğini kontrol et
console.log("📢 Kullanılan SESSION_SECRET:", process.env.SESSION_SECRET);

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  const server = registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on port 5000
  // this serves both the API and the client
  const PORT = 5000;
  server.listen(PORT, "0.0.0.0", () => {
    log(`serving on port ${PORT}`);
  });
})();
