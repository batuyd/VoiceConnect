import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Express } from "express";
import session from "express-session";
import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { storage } from "./storage";
import { User as SelectUser } from "@shared/schema";
import { authenticator } from 'otplib';
import nodemailer from 'nodemailer';
import twilio from 'twilio';

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

// E-posta doğrulama için transporter
const emailTransporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: Number(process.env.SMTP_PORT) || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

// SMS doğrulama için Twilio client
const twilioClient = process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN 
  ? twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
  : null;

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

      // İki faktörlü doğrulama açıksa, oturuma 2FA bekliyor olarak işaretle
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
    // Kullanıcı adı ve e-posta kontrolü
    const [existingUsername, existingEmail, existingPhone] = await Promise.all([
      storage.getUserByUsername(req.body.username),
      storage.getUserByEmail(req.body.email),
      storage.getUserByPhone(req.body.phone),
    ]);

    if (existingUsername) {
      return res.status(400).send("Bu kullanıcı adı zaten kullanımda");
    }
    if (existingEmail) {
      return res.status(400).send("Bu e-posta adresi zaten kullanımda");
    }
    if (existingPhone) {
      return res.status(400).send("Bu telefon numarası zaten kullanımda");
    }

    // Yeni kullanıcı oluştur
    const user = await storage.createUser({
      ...req.body,
      password: await hashPassword(req.body.password),
    });

    // E-posta doğrulama maili gönder
    if (emailTransporter) {
      await emailTransporter.sendMail({
        from: process.env.SMTP_FROM || '"OZBA" <noreply@ozba.com>',
        to: user.email,
        subject: "E-posta Adresinizi Doğrulayın",
        text: `Hoş geldiniz! E-posta adresinizi doğrulamak için aşağıdaki linke tıklayın:
        ${process.env.APP_URL}/verify-email?token=${randomBytes(32).toString('hex')}`,
      });
    }

    // SMS doğrulama mesajı gönder
    if (twilioClient) {
      await twilioClient.messages.create({
        body: `OZBA'ya hoş geldiniz! Doğrulama kodunuz: ${Math.floor(100000 + Math.random() * 900000)}`,
        to: user.phone,
        from: process.env.TWILIO_PHONE_NUMBER,
      });
    }

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