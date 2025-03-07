import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from "ws";
import * as schema from "@shared/schema";
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

neonConfig.webSocketConstructor = ws;

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set. Did you forget to provision a database?");
}

// ✅ PostgreSQL Bağlantısını Başlat
export const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// ✅ Bağlantıyı Test Et
pool.connect()
  .then(() => console.log("✅ PostgreSQL bağlantısı başarılı!"))
  .catch(err => console.error("🚨 PostgreSQL bağlantı hatası:", err.message));

export const db = drizzle({ client: pool, schema });

// ✅ PostgreSQL Bağlantısını Test Eden Fonksiyon
async function testDB() {
  try {
    const res = await pool.query("SELECT NOW()");
    console.log("📅 PostgreSQL Bağlantısı Başarılı! Server Saati:", res.rows[0].now);
  } catch (error) {
    if (error instanceof Error) {
      console.error("🚨 PostgreSQL bağlantı testi başarısız:", error.message);
    } else {
      console.error("🚨 PostgreSQL bağlantı testi başarısız:", error);
    }
  }
}

// ✅ Bağlantıyı Otomatik Test Et
testDB();
