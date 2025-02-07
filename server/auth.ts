import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Express } from "express";
import session from "express-session";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { storage } from "./storage";
import { insertUserSchema, User as SelectUser } from "@shared/schema";
import { ZodError } from "zod";
import { sendEmail, emailTemplates } from "./services/email";

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
  secret: process.env.REPL_ID!,
  resave: false,
  saveUninitialized: false,
  store: storage.sessionStore,
  cookie: {
    secure: false,
    maxAge: 24 * 60 * 60 * 1000,
    httpOnly: true,
    sameSite: 'lax'
  },
  name: 'sid'
};

export function setupAuth(app: Express) {
  if (app.get("env") === "production") {
    app.set("trust proxy", 1);
    sessionSettings.cookie!.secure = true;
  }

  app.use(session(sessionSettings));
  app.use(passport.initialize());
  app.use(passport.session());

  passport.use(
    new LocalStrategy(async (username: string, password: string, done) => {
      try {
        const user = await storage.getUserByUsername(username);
        if (!user) {
          return done(null, false, { message: "Geçersiz kullanıcı adı veya şifre" });
        }

        const isValidPassword = await comparePasswords(password, user.password);
        if (!isValidPassword) {
          return done(null, false, { message: "Geçersiz kullanıcı adı veya şifre" });
        }

        await storage.updateLastActive(user.id);
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
      const { username, password, email, phone } = req.body;

      if (!username || !password || !email || !phone) {
        return res.status(400).json({ 
          message: "Tüm alanlar zorunludur (kullanıcı adı, şifre, email ve telefon)" 
        });
      }

      const existingUser = await storage.getUserByUsername(username);
      if (existingUser) {
        return res.status(400).json({ 
          message: "Bu kullanıcı adı zaten kullanılıyor" 
        });
      }

      const existingEmail = await storage.getUserByEmail(email);
      if (existingEmail) {
        return res.status(400).json({ 
          message: "Bu email adresi zaten kullanılıyor" 
        });
      }

      const existingPhone = await storage.getUserByPhone(phone);
      if (existingPhone) {
        return res.status(400).json({ 
          message: "Bu telefon numarası zaten kullanılıyor" 
        });
      }

      try {
        const validatedData = insertUserSchema.parse(req.body);
        const hashedPassword = await hashPassword(password);

        const user = await storage.createUser({
          ...validatedData,
          password: hashedPassword,
          avatar: `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(username)}`
        });

        // Send welcome email
        const { subject, html } = emailTemplates.welcomeEmail(username);
        await sendEmail({
          to: email,
          subject,
          html
        });

        req.login(user, (err) => {
          if (err) {
            console.error('Login error after registration:', err);
            return next(err);
          }
          res.status(201).json(user);
        });
      } catch (error) {
        if (error instanceof ZodError) {
          return res.status(400).json({ 
            message: "Doğrulama hatası",
            errors: error.errors.map(err => ({
              field: err.path.join('.'),
              message: err.message
            }))
          });
        }
        throw error;
      }
    } catch (error) {
      console.error('Registration error:', error);
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
        return res.status(401).json({ 
          message: info?.message || "Kimlik doğrulama başarısız" 
        });
      }

      req.login(user, (err) => {
        if (err) {
          console.error('Session creation error:', err);
          return next(err);
        }
        res.json(user);
      });
    })(req, res, next);
  });

  app.post("/api/logout", (req, res, next) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({
        message: "Oturum açılmamış"
      });
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
      return res.status(401).json({ 
        message: "Oturum açılmamış" 
      });
    }
    res.json(req.user);
  });
}