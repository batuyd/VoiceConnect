import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Express } from "express";
import session from "express-session";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { storage } from "./storage";
import { User as SelectUser } from "@shared/schema";
import { sendEmail } from "./mail-service";

declare global {
  namespace Express {
    interface User extends SelectUser {}
  }
}

const scryptAsync = promisify(scrypt);

async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

async function comparePasswords(supplied: string, stored: string) {
  const [hashed, salt] = stored.split(".");
  const hashedBuf = Buffer.from(hashed, "hex");
  const suppliedBuf = (await scryptAsync(supplied, salt, 64)) as Buffer;
  return timingSafeEqual(hashedBuf, suppliedBuf);
}

async function generate2FACode(): Promise<string> {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

async function send2FACode(email: string, code: string): Promise<boolean> {
  return await sendEmail({
    to: email,
    subject: "Doğrulama Kodu",
    html: `
      <h1>Doğrulama Kodunuz</h1>
      <p>İki faktörlü doğrulama kodunuz: <strong>${code}</strong></p>
      <p>Bu kod 5 dakika süreyle geçerlidir.</p>
    `
  });
}

export function setupAuth(app: Express) {
  const sessionSettings: session.SessionOptions = {
    secret: process.env.SESSION_SECRET || process.env.REPL_ID!,
    resave: false,
    saveUninitialized: false,
    store: storage.sessionStore,
    cookie: {
      secure: app.get("env") === "production",
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      httpOnly: true,
      sameSite: 'lax'
    },
    name: 'ozba.session'
  };

  if (app.get("env") === "production") {
    app.set("trust proxy", 1);
  }

  const sessionMiddleware = session(sessionSettings);
  app.use(sessionMiddleware);
  app.use(passport.initialize());
  app.use(passport.session());

  // Explicitly attach session middleware to app for WebSocket use
  (app as any).sessionMiddleware = sessionMiddleware;

  passport.use(
    new LocalStrategy(async (username, password, done) => {
      try {
        const user = await storage.getUserByUsername(username);
        if (!user) {
          return done(null, false, { message: "Geçersiz kullanıcı adı veya şifre" });
        }

        const isValidPassword = await comparePasswords(password, user.password);
        if (!isValidPassword) {
          return done(null, false, { message: "Geçersiz kullanıcı adı veya şifre" });
        }

        // 2FA kodu oluştur ve gönder
        if (user.email) {
          const code = await generate2FACode();
          await storage.set2FACode(user.id, code);
          await send2FACode(user.email, code);
          return done(null, { ...user, requiresSecondFactor: true });
        }

        return done(null, user);
      } catch (error) {
        console.error('Kimlik doğrulama hatası:', error);
        return done(error);
      }
    }),
  );

  passport.serializeUser((user, done) => {
    done(null, user.id);
  });

  passport.deserializeUser(async (id: number, done) => {
    try {
      const user = await storage.getUser(id);
      if (!user) {
        return done(null, false);
      }
      done(null, user);
    } catch (error) {
      console.error('Oturum deserializasyon hatası:', error);
      done(error);
    }
  });

  // Auth routes
  app.post("/api/register", async (req, res, next) => {
    try {
      const existingUser = await storage.getUserByUsername(req.body.username);
      if (existingUser) {
        return res.status(400).json({ message: "Bu kullanıcı adı zaten kullanılıyor" });
      }

      const user = await storage.createUser({
        ...req.body,
        password: await hashPassword(req.body.password),
      });

      req.login(user, (err) => {
        if (err) return next(err);
        res.status(201).json(user);
      });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/login", passport.authenticate("local"), (req, res) => {
    if (req.user?.requiresSecondFactor) {
      return res.status(202).json({ message: "2FA kodu gerekli" });
    }
    res.status(200).json(req.user);
  });

  app.post("/api/verify-2fa", async (req, res) => {
    if (!req.user?.requiresSecondFactor) {
      return res.status(400).json({ message: "2FA doğrulaması gerekli değil" });
    }

    const { code } = req.body;
    const isValid = await storage.verify2FACode(req.user.id, code);

    if (!isValid) {
      return res.status(400).json({ message: "Geçersiz veya süresi dolmuş kod" });
    }

    // 2FA başarılı, tam yetkili kullanıcı oturumunu başlat
    const user = await storage.getUser(req.user.id);
    req.login(user, (err) => {
      if (err) {
        return res.status(500).json({ message: "Oturum başlatılamadı" });
      }
      res.status(200).json(user);
    });
  });

  app.post("/api/logout", (req, res, next) => {
    req.logout((err) => {
      if (err) return next(err);
      res.sendStatus(200);
    });
  });

  app.get("/api/user", (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    res.json(req.user);
  });

  return sessionMiddleware;
}