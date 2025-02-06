import type { Express } from "express";
import { createServer, type Server } from "http";
import { setupAuth } from "./auth";
import { storage } from "./storage";

export function registerRoutes(app: Express): Server {
  setupAuth(app);

  app.get("/api/servers", async (req, res) => {
    if (!req.user) return res.sendStatus(401);
    const servers = await storage.getServers(req.user.id);
    res.json(servers);
  });

  app.get("/api/servers/:serverId", async (req, res) => {
    if (!req.user) return res.sendStatus(401);
    const server = await storage.getServer(parseInt(req.params.serverId));
    if (!server) return res.sendStatus(404);
    res.json(server);
  });

  app.post("/api/servers", async (req, res) => {
    if (!req.user) return res.sendStatus(401);
    const server = await storage.createServer(req.body.name, req.user.id);
    res.status(201).json(server);
  });

  app.get("/api/servers/:serverId/channels", async (req, res) => {
    if (!req.user) return res.sendStatus(401);
    const channels = await storage.getChannels(parseInt(req.params.serverId));
    res.json(channels);
  });

  app.post("/api/servers/:serverId/channels", async (req, res) => {
    if (!req.user) return res.sendStatus(401);
    const server = await storage.getServer(parseInt(req.params.serverId));
    if (!server || server.ownerId !== req.user.id) {
      return res.sendStatus(403);
    }
    const channel = await storage.createChannel(
      req.body.name,
      parseInt(req.params.serverId),
      req.body.isVoice
    );
    res.status(201).json(channel);
  });

  app.get("/api/servers/:serverId/members", async (req, res) => {
    if (!req.user) return res.sendStatus(401);
    const members = await storage.getServerMembers(parseInt(req.params.serverId));
    res.json(members);
  });

  app.post("/api/servers/:serverId/members", async (req, res) => {
    if (!req.user) return res.sendStatus(401);
    await storage.addServerMember(parseInt(req.params.serverId), req.body.userId);
    res.sendStatus(201);
  });

  const httpServer = createServer(app);
  return httpServer;
}