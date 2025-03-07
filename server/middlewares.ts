import { Request, Response, NextFunction } from "express";
import { storage } from "./storage";

export function ensureAuthenticated(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.sendStatus(401);
  }
  next();
}

export async function ensureServerMember(req: Request, res: Response, next: NextFunction) {
  const serverId = parseInt(req.params.serverId);
  const userId = req.user?.id;

  if (!userId) {
    return res.sendStatus(401);
  }

  const isMember = await storage.isServerMember(serverId, userId);
  if (!isMember) {
    return res.sendStatus(403);
  }

  next();
}

export async function ensureServerOwner(req: Request, res: Response, next: NextFunction) {
  const serverId = parseInt(req.params.serverId);
  const userId = req.user?.id;

  if (!userId) {
    return res.sendStatus(401);
  }

  const server = await storage.getServer(serverId);
  if (!server || server.ownerId !== userId) {
    return res.sendStatus(403);
  }

  next();
}
