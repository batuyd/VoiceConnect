import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Express } from "express";
import session from "express-session";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { storage } from "./storage";
import { User as SelectUser } from "@shared/schema";
import cors from "cors";

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

export function setupAuth(app: Express) {
  // CORS ayarlarını güncelle - her zaman session için cookie'lere izin ver
  app.use(cors({
    origin: process.env.NODE_ENV === 'production' 
      ? process.env.FRONTEND_URL 
      : ['http://localhost:3000', 'http://localhost:5000'],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Cookie']
  }));

  const sessionSettings: session.SessionOptions = {
    secret: process.env.SESSION_SECRET || process.env.REPL_ID!,
    resave: false,
    saveUninitialized: false,
    store: storage.sessionStore,
    cookie: {
      secure: app.get("env") === "production",
      maxAge: 24 * 60 * 60 * 1000, // 24 saat
      httpOnly: true,
      sameSite: app.get("env") === "production" ? 'none' : 'lax',
      path: '/',
      domain: app.get("env") === "production" ? process.env.COOKIE_DOMAIN : undefined
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

  // WebSocket için session middleware'i dışa aktar
  (app as any).sessionMiddleware = sessionMiddleware;

  passport.use(
    new LocalStrategy(async (username, password, done) => {
      try {
        console.log('Login attempt:', username);
        const user = await storage.getUserByUsername(username);
        if (!user) {
          console.log('Login failed: User not found -', username);
          return done(null, false, { message: "Geçersiz kullanıcı adı veya şifre" });
        }

        const isValidPassword = await comparePasswords(password, user.password);
        if (!isValidPassword) {
          console.log('Login failed: Invalid password -', username);
          return done(null, false, { message: "Geçersiz kullanıcı adı veya şifre" });
        }

        console.log('Login successful:', username);
        const authUser: Express.User = {
          ...user,
          requiresSecondFactor: user.twoFactorEnabled
        };

        return done(null, authUser);
      } catch (error) {
        console.error('Login error:', error);
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
        console.log('User not found:', id);
        return done(null, false);
      }

      const authUser: Express.User = {
        ...user,
        requiresSecondFactor: user.twoFactorEnabled
      };

      console.log('User deserialized successfully:', id);
      done(null, authUser);
    } catch (error) {
      console.error('Deserialization error:', error);
      done(error);
    }
  });

  // Register endpoint
  app.post("/api/register", async (req, res, next) => {
    try {
      console.log('Register attempt:', req.body.username);
      const existingUser = await storage.getUserByUsername(req.body.username);
      if (existingUser) {
        console.log('Registration failed: Username exists -', req.body.username);
        return res.status(400).json({ message: "Bu kullanıcı adı zaten kullanılıyor" });
      }

      const hashedPassword = await hashPassword(req.body.password);
      const user = await storage.createUser({
        ...req.body,
        password: hashedPassword,
      });

      const authUser: Express.User = {
        ...user,
        requiresSecondFactor: user.twoFactorEnabled
      };

      req.login(authUser, (err) => {
        if (err) {
          console.error('Registration login error:', err);
          return next(err);
        }
        console.log('User registered and logged in:', authUser.id);
        res.status(201).json(authUser);
      });
    } catch (error) {
      console.error('Registration error:', error);
      next(error);
    }
  });

  // Login endpoint
  app.post("/api/login", (req, res, next) => {
    console.log('Login attempt:', req.body.username);
    passport.authenticate("local", (err: Error | null, user: Express.User | false, info: any) => {
      if (err) {
        console.error('Authentication error:', err);
        return next(err);
      }

      if (!user) {
        console.log('Login failed:', info?.message);
        return res.status(401).json({ message: info?.message || "Kimlik doğrulama başarısız" });
      }

      req.login(user, (loginErr) => {
        if (loginErr) {
          console.error('Login error:', loginErr);
          return next(loginErr);
        }
        console.log('User logged in:', user.id);
        res.status(200).json(user);
      });
    })(req, res, next);
  });

  // Logout endpoint
  app.post("/api/logout", (req, res, next) => {
    console.log('Logout request for user:', req.user?.id);
    req.logout((err) => {
      if (err) {
        console.error('Logout error:', err);
        return next(err);
      }
      console.log('User logged out successfully');
      res.sendStatus(200);
    });
  });

  // User info endpoint
  app.get("/api/user", (req, res) => {
    console.log('User request:', req.isAuthenticated(), req.user?.id);
    if (!req.isAuthenticated()) {
      return res.status(401).json({ message: "Yetkilendirme gerekli" });
    }
    res.json(req.user);
  });

  return sessionMiddleware;
}
