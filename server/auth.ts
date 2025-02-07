import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Express } from "express";
import session from "express-session";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { storage } from "./storage";
import { User as SelectUser } from "@shared/schema";
import { sendEmail } from "./mail-service";
import cors from 'cors';

declare global {
  namespace Express {
    interface User extends SelectUser {
      requiresSecondFactor?: boolean;
    }
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
  // CORS ayarlarını güncelledim
  app.use(cors({
    origin: process.env.NODE_ENV === 'production' ? 'https://your-domain.com' : 'http://localhost:3000',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    exposedHeaders: ['Set-Cookie'],
  }));

  const sessionSettings: session.SessionOptions = {
    secret: process.env.SESSION_SECRET || process.env.REPL_ID!,
    name: 'ozba.session',
    resave: false,
    saveUninitialized: false,
    store: storage.sessionStore,
    proxy: true, // Trust the reverse proxy
    cookie: {
      secure: app.get("env") === "production",
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000, // 24 saat
      sameSite: app.get("env") === "production" ? 'none' : 'lax',
      path: '/',
      domain: app.get("env") === "production" ? '.your-domain.com' : undefined
    }
  };

  if (app.get("env") === "production") {
    app.set("trust proxy", 1);
  }

  app.use(session(sessionSettings));
  app.use(passport.initialize());
  app.use(passport.session());

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

        if (user.twoFactorEnabled && user.email) {
          const code = await generate2FACode();
          await storage.set2FACode(user.id, code);
          const emailSent = await send2FACode(user.email, code);

          if (!emailSent) {
            return done(new Error("2FA kodu gönderilemedi"));
          }

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
    console.log('Serializing user:', user.id);
    done(null, user.id);
  });

  passport.deserializeUser(async (id: number, done) => {
    try {
      console.log('Deserializing user:', id);
      const user = await storage.getUser(id);
      if (!user) {
        console.log('User not found during deserialization');
        return done(null, false);
      }
      done(null, user);
    } catch (error) {
      console.error('Oturum deserializasyon hatası:', error);
      done(error);
    }
  });

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

  app.post("/api/login", (req, res, next) => {
    passport.authenticate("local", (err, user, info) => {
      if (err) {
        console.error('Login error:', err);
        return next(err);
      }

      if (!user) {
        return res.status(401).json({ message: info?.message || "Kimlik doğrulama başarısız" });
      }

      req.login(user, (loginErr) => {
        if (loginErr) {
          console.error('Login error:', loginErr);
          return next(loginErr);
        }

        if (user.requiresSecondFactor) {
          return res.status(202).json({ message: "2FA kodu gerekli", requiresSecondFactor: true });
        }

        console.log('Login successful:', user.id);
        res.status(200).json(user);
      });
    })(req, res, next);
  });

  app.post("/api/verify-2fa", async (req, res) => {
    if (!req.user?.requiresSecondFactor) {
      return res.status(400).json({ message: "2FA doğrulaması gerekli değil" });
    }

    const { code } = req.body;
    if (!code) {
      return res.status(400).json({ message: "Doğrulama kodu gerekli" });
    }

    try {
      const isValid = await storage.verify2FACode(req.user.id, code);

      if (!isValid) {
        return res.status(400).json({ message: "Geçersiz veya süresi dolmuş kod" });
      }

      const user = await storage.getUser(req.user.id);
      if (!user) {
        return res.status(404).json({ message: "Kullanıcı bulunamadı" });
      }

      // 2FA başarılı, tam yetkili kullanıcı oturumunu başlat
      req.login(user, (err) => {
        if (err) {
          return res.status(500).json({ message: "Oturum başlatılamadı" });
        }
        console.log('2FA verification successful:', user.id);
        res.status(200).json(user);
      });
    } catch (error) {
      console.error('2FA doğrulama hatası:', error);
      res.status(500).json({ message: "2FA doğrulama işlemi başarısız" });
    }
  });

  app.post("/api/logout", (req, res, next) => {
    const userId = req.user?.id;
    console.log('Logging out user:', userId);
    req.logout((err) => {
      if (err) return next(err);
      res.sendStatus(200);
    });
  });

  app.get("/api/user", (req, res) => {
    console.log('User request - authenticated:', req.isAuthenticated());
    console.log('User request - session:', req.session);
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Yetkilendirme gerekli" });
    }
    res.json(req.user);
  });

  return app;
}