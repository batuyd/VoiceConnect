import { db } from "./db"; // Veritabanı bağlantısını içeri aktar
import { users } from "../shared/schema"; // Kullanıcı tablosunu içeri aktar

async function testDatabaseConnection() {
  try {
    console.log("🟢 PostgreSQL bağlantısı test ediliyor...");
    const result = await db.select().from(users).limit(1);
    console.log("✅ Veritabanı bağlantısı başarılı!", result);
  } catch (error) {
    console.error("❌ Veritabanı bağlantısı başarısız!", error);
  }
}

testDatabaseConnection();
