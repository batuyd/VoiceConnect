import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Express } from "express";
import session from "express-session";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { storage } from "./storage";
import { insertUserSchema, User as SelectUser } from "@shared/schema";
import { ZodError } from "zod";

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

export const sessionSettings: session.SessionOptions = {
  secret: process.env.SESSION_SECRET || "65458598_super_secret_key!@#$",
  resave: false,
  saveUninitialized: false,
  store: storage.sessionStore,
  cookie: {// secure: false, httpOnly: true, sameSite: 'lax' }
    secure: process.env.NODE_ENV === 'production',
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    httpOnly: true,
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    path: '/',
  },
  rolling: true, // Refresh session with each request
  name: 'sid' // Custom cookie name for better security
};

export function setupAuth(app: Express) {
  // Trust first proxy in production
  if (app.get("env") === "production") {
    app.set("trust proxy", 1);
    sessionSettings.cookie!.secure = true;
  }

  const sessionMiddleware = session(sessionSettings);
  app.use(sessionMiddleware);
  app.use(passport.initialize());
  app.use(passport.session());

  passport.use(
    new LocalStrategy(async (username: string, password: string, done) => {
      try {
		console.log("🔍 Kullanıcı giriş yapıyor:", username);
        const user = await storage.getUserByUsername(username);
		console.log("📢 Veritabanından çekilen kullanıcı:", user);
		
        if (!user) {
		  console.log("❌ Kullanıcı bulunamadı:", username);
          return done(null, false, { message: "Invalid username or password" });
        }

        const isValidPassword = await comparePasswords(password, user.password);
		console.log("🔑 Şifre karşılaştırma sonucu:", isValidPassword);
        if (!isValidPassword) {
		  console.log("❌ Yanlış şifre girildi:", password);
          return done(null, false, { message: "Invalid username or password" });
        }

        await storage.updateLastActive(user.id);
		console.log("✅ Kullanıcı giriş yaptı:", user.username);
        return done(null, user);
      } catch (error) {
        console.error('Authentication error:', error);
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
      await storage.updateLastActive(user.id);
      done(null, user);
    } catch (error) {
      console.error('Session deserialization error:', error);
      done(error);
    }
  });

  app.post("/api/register", async (req, res, next) => {
    try {
	  console.log("📢 Kayıt işlemi başladı:", req.body);
		
      const validatedData = insertUserSchema.parse(req.body);
	  console.log("✅ Form doğrulandı:", validatedData);
	  
      const existingUser = await storage.getUserByUsername(validatedData.username);
      if (existingUser) {
	  console.log("❌ Kullanıcı adı zaten kayıtlı:", validatedData.username);	  
        return res.status(400).json({ message: "Username already exists" });
      }
	  
      const existingEmail = await storage.getUserByEmail(validatedData.email);
      if (existingEmail) {
	  console.log("❌ Email zaten kayıtlı:", validatedData.email);	  
        return res.status(400).json({ message: "Email already exists" });
      }
	  
      const hashedPassword = await hashPassword(validatedData.password);
	  console.log("🔐 Şifre Hashlendi!");
	  
      const user = await storage.createUser({
        ...validatedData,
        password: hashedPassword,
        avatar: `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(validatedData.username)}`
      });
	  console.log("✅ Kullanıcı veritabanına eklendi:", user);
	  
      req.login(user, (err) => {
        if (err) {
          console.error('Login error after registration:', err);
          return next(err);
        }
		console.log("✅ Kullanıcı giriş yaptı.");
        req.session.save((err) => {
          if (err) {
            console.error('Session save error:', err);
            return next(err);
          }
          res.status(201).json(user);
        });
      });
    } catch (error) {
      if (error instanceof ZodError) {
		console.error("❌ Validation error:", error.errors);  
        return res.status(400).json({ 
          message: "Validation error",
          errors: error.errors 
        });
      }
	  console.error("❌ Genel hata:", error);
      next(error);
    }
  });

  app.post("/api/login", (req, res, next) => {
    passport.authenticate("local", (err: any, user: SelectUser | false, info: any) => {
      if (err) {
        console.error('Login error:', err);
        return next(err);
      }
      if (!user) {
        return res.status(401).json({ message: info?.message || "Authentication failed" });
      }
      req.login(user, (err) => {
        if (err) {
          console.error('Session creation error:', err);
          return next(err);
        }
        req.session.save((err) => {
          if (err) {
            console.error('Session save error:', err);
            return next(err);
          }
          res.json(user);
        });
      });
    })(req, res, next);
  });

  app.post("/api/logout", (req, res, next) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    req.logout((err) => {
      if (err) {
        console.error('Logout error:', err);
        return next(err);
      }
      req.session.destroy((err) => {
        if (err) {
          console.error('Session destruction error:', err);
          return next(err);
        }
        res.clearCookie('sid');
        res.sendStatus(200);
      });
    });
  });

  app.get("/api/user", (req, res) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    res.json(req.user);
  });

  // Return the sessionMiddleware for use in WebSocket authentication
  return sessionMiddleware;
}