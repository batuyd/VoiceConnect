import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Express, Request, Response, NextFunction } from "express";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { storage } from "./storage";
import { User as SelectUser } from "@shared/schema";
import { sendEmail } from "./mail-service";
import cors from 'cors';
import jwt from 'jsonwebtoken';

declare global {
  namespace Express {
    interface User extends SelectUser {
      requiresSecondFactor?: boolean;
    }
  }
}

const scryptAsync = promisify(scrypt);
const JWT_SECRET = process.env.JWT_SECRET || process.env.REPL_ID!;
const TOKEN_EXPIRY = '24h';

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

function generateToken(user: SelectUser) {
  return jwt.sign(
    { 
      id: user.id, 
      username: user.username,
      requiresSecondFactor: user.twoFactorEnabled 
    },
    JWT_SECRET,
    { expiresIn: TOKEN_EXPIRY }
  );
}

function verifyToken(token: string): Promise<any> {
  return new Promise((resolve, reject) => {
    jwt.verify(token, JWT_SECRET, (err, decoded) => {
      if (err) return reject(err);
      resolve(decoded);
    });
  });
}

async function authenticateToken(req: Request, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.split(' ')[1];

    if (!token) {
      return res.status(401).json({ message: "Token gerekli" });
    }

    const decoded = await verifyToken(token);
    const user = await storage.getUser(decoded.id);

    if (!user) {
      return res.status(401).json({ message: "Geçersiz token" });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ message: "Geçersiz token" });
  }
}

export function setupAuth(app: Express) {
  app.use(cors({
    origin: process.env.NODE_ENV === 'production' ? 'https://your-domain.com' : 'http://localhost:3000',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  }));

  app.use(passport.initialize());

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


  app.post("/api/register", async (req, res) => {
    try {
      const existingUser = await storage.getUserByUsername(req.body.username);
      if (existingUser) {
        return res.status(400).json({ message: "Bu kullanıcı adı zaten kullanılıyor" });
      }

      const user = await storage.createUser({
        ...req.body,
        password: await hashPassword(req.body.password),
      });

      const token = generateToken(user);
      res.status(201).json({ user, token });
    } catch (error) {
      console.error('Kayıt hatası:', error);
      res.status(500).json({ message: "Kayıt işlemi başarısız" });
    }
  });

  app.post("/api/login", (req, res, next) => {
    passport.authenticate("local", (err, user, info) => {
      if (err) {
        console.error('Login error:', err);
        return res.status(500).json({ message: "Giriş hatası" });
      }

      if (!user) {
        return res.status(401).json({ message: info?.message || "Kimlik doğrulama başarısız" });
      }

      if (user.requiresSecondFactor) {
        return res.status(202).json({ 
          message: "2FA kodu gerekli", 
          requiresSecondFactor: true,
          tempToken: generateToken({ ...user, twoFactorEnabled: true })
        });
      }

      const token = generateToken(user);
      res.status(200).json({ user, token });
    })(req, res, next);
  });

  app.post("/api/verify-2fa", async (req, res) => {
    const authHeader = req.headers.authorization;
    const tempToken = authHeader?.split(' ')[1];

    if (!tempToken) {
      return res.status(401).json({ message: "Token gerekli" });
    }

    try {
      const decoded = await verifyToken(tempToken);
      if (!decoded.requiresSecondFactor) {
        return res.status(400).json({ message: "2FA doğrulaması gerekli değil" });
      }

      const { code } = req.body;
      if (!code) {
        return res.status(400).json({ message: "Doğrulama kodu gerekli" });
      }

      const isValid = await storage.verify2FACode(decoded.id, code);
      if (!isValid) {
        return res.status(400).json({ message: "Geçersiz veya süresi dolmuş kod" });
      }

      const user = await storage.getUser(decoded.id);
      if (!user) {
        return res.status(404).json({ message: "Kullanıcı bulunamadı" });
      }

      const token = generateToken(user);
      res.status(200).json({ user, token });
    } catch (error) {
      console.error('2FA doğrulama hatası:', error);
      res.status(500).json({ message: "2FA doğrulama işlemi başarısız" });
    }
  });

  app.get("/api/user", authenticateToken, (req, res) => {
    res.json(req.user);
  });

  return app;
}