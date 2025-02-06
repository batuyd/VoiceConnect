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

  app.get("/api/channels/:channelId/members", async (req, res) => {
    if (!req.user) return res.sendStatus(401);
    const channel = await storage.getChannel(parseInt(req.params.channelId));
    if (!channel) return res.sendStatus(404);
    const members = await storage.getServerMembers(channel.serverId);
    const connectedMembers = members.map(member => ({
      ...member,
      isMuted: Math.random() > 0.5
    }));
    res.json(connectedMembers);
  });

  app.patch("/api/user/profile", async (req, res) => {
    if (!req.user) return res.sendStatus(401);

    const updatedUser = await storage.updateUserProfile(req.user.id, {
      bio: req.body.bio,
      age: req.body.age,
      avatar: req.body.avatar,
    });

    res.json(updatedUser);
  });

  // Message routes
  app.get("/api/channels/:channelId/messages", async (req, res) => {
    if (!req.user) return res.sendStatus(401);
    const messages = await storage.getMessages(parseInt(req.params.channelId));
    res.json(messages);
  });

  app.post("/api/channels/:channelId/messages", async (req, res) => {
    if (!req.user) return res.sendStatus(401);

    // Call original handler.  This assumes app.routes.post is available and contains the original handler.  This might require refactoring depending on the express setup.
    const originalPostMessage = app.routes.post["/api/channels/:channelId/messages"];
    await originalPostMessage(req, res);


    const achievements = await storage.getUserAchievements(req.user.id);
    const messageAchievement = achievements.find(a => a.type === "messages");
    if (messageAchievement) {
      await storage.updateUserAchievement(req.user.id, "messages", messageAchievement.progress + 1);
    } else {
      await storage.updateUserAchievement(req.user.id, "messages", 1);
    }
  });

  // Reaction routes
  app.post("/api/messages/:messageId/reactions", async (req, res) => {
    if (!req.user) return res.sendStatus(401);
    const reaction = await storage.addReaction(
      parseInt(req.params.messageId),
      req.user.id,
      req.body.emoji
    );
    res.status(201).json(reaction);
  });

  app.delete("/api/messages/:messageId/reactions/:emoji", async (req, res) => {
    if (!req.user) return res.sendStatus(401);
    await storage.removeReaction(
      parseInt(req.params.messageId),
      req.user.id,
      req.params.emoji
    );
    res.sendStatus(200);
  });


  // Coin related routes
  app.get("/api/coins", async (req, res) => {
    if (!req.user) return res.sendStatus(401);
    const userCoins = await storage.getUserCoins(req.user.id);
    if (!userCoins) {
      const newUserCoins = await storage.createUserCoins(req.user.id);
      res.json(newUserCoins);
    } else {
      res.json(userCoins);
    }
  });

  app.post("/api/coins/daily-reward", async (req, res) => {
    if (!req.user) return res.sendStatus(401);
    try {
      const transaction = await storage.claimDailyReward(req.user.id);
      res.json(transaction);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  app.get("/api/coins/products", async (req, res) => {
    if (!req.user) return res.sendStatus(401);
    const products = await storage.getCoinProducts();
    res.json(products);
  });

  app.get("/api/achievements", async (req, res) => {
    if (!req.user) return res.sendStatus(401);
    const achievements = await storage.getUserAchievements(req.user.id);
    res.json(achievements);
  });

  // Gift related routes
  app.get("/api/gifts", async (req, res) => {
    if (!req.user) return res.sendStatus(401);
    const gifts = await storage.getGifts();
    res.json(gifts);
  });

  app.post("/api/gifts/send", async (req, res) => {
    if (!req.user) return res.sendStatus(401);
    try {
      const giftHistory = await storage.sendGift(
        req.user.id,
        req.body.receiverId,
        req.body.giftId,
        req.body.message
      );
      res.status(201).json(giftHistory);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  app.get("/api/gifts/history", async (req, res) => {
    if (!req.user) return res.sendStatus(401);
    const history = await storage.getGiftHistory(req.user.id);
    res.json(history);
  });

  // Level related routes
  app.get("/api/user/level", async (req, res) => {
    if (!req.user) return res.sendStatus(401);
    const userLevel = await storage.getUserLevel(req.user.id);
    res.json(userLevel);
  });

  const httpServer = createServer(app);
  return httpServer;
}