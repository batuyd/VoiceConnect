import cors from "cors";
import { Express } from "express";

declare global {
  namespace Express {
    interface User extends {} {
    }
  }
}

export function setupAuth(app: Express) {
  app.use(cors({
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Cookie']
  }));
}