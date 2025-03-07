import { Router, Request, Response, NextFunction } from "express";
import { storage } from "../storage";
import { ensureAuthenticated, ensureServerMember, ensureServerOwner } from "../middlewares.ts";

const router = Router();

router.post("/:serverId/channels", ensureAuthenticated, ensureServerMember, async (req, res) => {
  if (!req.user) return res.sendStatus(401);
  try {
    const server = await storage.getServer(parseInt(req.params.serverId));
    if (!server || server.ownerId !== req.user.id) {
      return res.status(403).json({ message: "Only server owner can create channels" });
    }

    if (!req.body.name || typeof req.body.name !== 'string' || !req.body.name.trim()) {
      return res.status(400).json({ message: "Channel name is required" });
    }

    const channel = await storage.createChannel(
      req.body.name.trim(),
      parseInt(req.params.serverId),
      req.body.isVoice || false,
      req.body.isPrivate || false
    );

    console.log('Created channel:', channel);
    res.status(201).json(channel);
  } catch (error: unknown) {
    console.error('Create channel error:', error);
    res.status(500).json({ message: "Failed to create channel" });
  }
});

router.delete("/:channelId", ensureAuthenticated, ensureServerOwner, async (req, res) => {
  if (!req.user) return res.sendStatus(401);

  try {
    const channel = await storage.getChannel(parseInt(req.params.channelId));
    if (!channel) return res.sendStatus(404);

    const server = await storage.getServer(channel.serverId);
    if (!server || server.ownerId !== req.user.id) {
      return res.sendStatus(403);
    }

    await storage.deleteChannel(parseInt(req.params.channelId));
    res.sendStatus(200);
  } catch (error: unknown) {
    console.error('Delete channel error:', error);
    res.status(400).json({ error: (error as Error).message });
  }
});

router.get("/:serverId/channels", ensureAuthenticated, ensureServerMember, async (req, res) => {
  if (!req.user) return res.sendStatus(401);
  try {
    const channels = await storage.getChannels(parseInt(req.params.serverId));
    res.json(channels);
  } catch (error: unknown) {
    console.error('Get channels error:', error);
    res.status(500).json({ message: "Failed to get channels" });
  }
});

export default router;
