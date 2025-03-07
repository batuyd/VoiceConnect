import { Router, Request, Response, NextFunction } from "express";
import { storage } from "../storage";
import { ensureAuthenticated, ensureServerOwner, ensureServerMember } from "../middlewares.ts";

const router = Router();

router.post("/", ensureAuthenticated, async (req, res) => {
  if (!req.user) return res.sendStatus(401);
  try {
    console.log('Creating server:', req.body);
    const server = await storage.createServer(req.body.name, req.user.id);

    // Kullanıcıya adminlik yetkisi ver
    await storage.addServerMember(server.id, req.user.id, true);

    console.log('Server created:', server);
    res.status(201).json(server);
  } catch (error: unknown) {
    console.error('Create server error:', error);
    res.status(500).json({ message: (error as Error).message });
  }
});

router.delete("/:serverId", ensureAuthenticated, ensureServerOwner, async (req, res) => {
  if (!req.user) return res.sendStatus(401);
  try {
    const server = await storage.getServer(parseInt(req.params.serverId));
    if (!server) return res.sendStatus(404);

    await storage.deleteServer(parseInt(req.params.serverId), req.user.id);
    res.sendStatus(200);
  } catch (error: unknown) {
    console.error('Delete server error:', error);
    res.status(400).json({ error: (error as Error).message });
  }
});

router.get("/", ensureAuthenticated, async (req, res) => {
  if (!req.user) return res.sendStatus(401);
  try {
    const servers = await storage.getServers(req.user.id);
    res.json(servers);
  } catch (error: unknown) {
    console.error('Get servers error:', error);
    res.status(500).json({ message: (error as Error).message });
  }
});

router.get("/:serverId", ensureAuthenticated, ensureServerMember, async (req, res) => {
  if (!req.user) return res.sendStatus(401);
  try {
    const server = await storage.getServer(parseInt(req.params.serverId));
    if (!server) return res.sendStatus(404);
    res.json(server);
  } catch (error: unknown) {
    console.error('Get server error:', error);
    res.status(500).json({ message: (error as Error).message });
  }
});

export default router;
