import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Express } from "express";
import session from "express-session";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { storage } from "./storage";
import { User as SelectUser } from "@shared/schema";
import { authenticator } from 'otplib';

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

export function setupAuth(app: Express) {
  const sessionSettings: session.SessionOptions = {
    secret: process.env.REPL_ID!,
    resave: false,
    saveUninitialized: false,
    store: storage.sessionStore,
  };

  if (app.get("env") === "production") {
    app.set("trust proxy", 1);
  }

  app.use(session(sessionSettings));
  app.use(passport.initialize());
  app.use(passport.session());

  passport.use(
    new LocalStrategy(async (username, password, done) => {
      const user = await storage.getUserByUsername(username);
      if (!user || !(await comparePasswords(password, user.password))) {
        return done(null, false);
      }

      if (user.twoFactorEnabled) {
        return done(null, false, { message: "2FA_REQUIRED", userId: user.id });
      }

      return done(null, user);
    }),
  );

  passport.serializeUser((user, done) => done(null, user.id));
  passport.deserializeUser(async (id: number, done) => {
    const user = await storage.getUser(id);
    done(null, user);
  });

  app.post("/api/register", async (req, res, next) => {
    const existingUsername = await storage.getUserByUsername(req.body.username);
    if (existingUsername) {
      return res.status(400).send("Bu kullanıcı adı zaten kullanımda");
    }

    // Create user without verification
    const user = await storage.createUser({
      ...req.body,
      password: await hashPassword(req.body.password),
    });

    req.login(user, (err) => {
      if (err) return next(err);
      res.status(201).json(user);
    });
  });

  app.post("/api/login", passport.authenticate("local"), (req, res) => {
    res.status(200).json(req.user);
  });

  app.post("/api/verify-2fa", async (req, res) => {
    const { userId, token } = req.body;
    const user = await storage.getUser(userId);

    if (!user?.twoFactorSecret) {
      return res.status(400).send("2FA not set up");
    }

    const isValid = authenticator.verify({
      token,
      secret: user.twoFactorSecret,
    });

    if (!isValid) {
      return res.status(400).send("Invalid 2FA token");
    }

    req.login(user, (err) => {
      if (err) return res.status(500).send(err.message);
      res.status(200).json(user);
    });
  });

  app.post("/api/setup-2fa", async (req, res) => {
    if (!req.user) return res.sendStatus(401);

    const secret = authenticator.generateSecret();
    await storage.updateUserTwoFactor(req.user.id, true, secret);

    const otpauth = authenticator.keyuri(
      req.user.username,
      "OZBA",
      secret
    );

    res.json({ 
      secret,
      otpauth,
    });
  });

  app.post("/api/disable-2fa", async (req, res) => {
    if (!req.user) return res.sendStatus(401);

    await storage.updateUserTwoFactor(req.user.id, false);
    res.sendStatus(200);
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
}