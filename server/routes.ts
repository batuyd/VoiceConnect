import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { WebSocketServer } from 'ws';
import cors from 'cors';

export function registerRoutes(app: Express): Server {
  // CORS ayarlarını güncelle
  app.use(cors({
    origin: true,
    credentials: true,
    allowedHeaders: ['Authorization', 'Content-Type', 'X-Requested-With'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    maxAge: 600 // 10 dakika
  }));

  // Auth hatalarını yakala
  app.use((err: any, _req: any, res: any, next: any) => {
    if (err.name === 'UnauthorizedError') {
      res.status(401).json({ error: 'Yetkisiz erişim' });
    } else {
      next(err);
    }
  });

  app.get("/api/servers", async (_req, res) => {
    const servers = await storage.getServers(1); // Default user ID
    res.json(servers);
  });

  app.get("/api/servers/:serverId", async (req, res) => {
    const server = await storage.getServer(parseInt(req.params.serverId));
    if (!server) return res.sendStatus(404);
    res.json(server);
  });

  app.post("/api/servers", async (req, res) => {
    const server = await storage.createServer(req.body.name, 1); // Default user ID
    res.status(201).json(server);
  });

  app.get("/api/servers/:serverId/channels", async (req, res) => {
    const channels = await storage.getChannels(parseInt(req.params.serverId));
    res.json(channels);
  });

  app.post("/api/servers/:serverId/channels", async (req, res) => {
    const channel = await storage.createChannel(
      req.body.name,
      parseInt(req.params.serverId),
      req.body.isVoice,
      req.body.isPrivate
    );
    res.status(201).json(channel);
  });

  // Kanal silme endpoint'i
  app.delete("/api/channels/:channelId", async (req, res) => {
    try {
      const channel = await storage.getChannel(parseInt(req.params.channelId));
      if (!channel) return res.sendStatus(404);

      await storage.deleteChannel(parseInt(req.params.channelId));
      res.sendStatus(200);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.get("/api/servers/:serverId/members", async (req, res) => {
    const members = await storage.getServerMembers(parseInt(req.params.serverId));
    res.json(members);
  });

  app.post("/api/servers/:serverId/members", async (req, res) => {
    await storage.addServerMember(parseInt(req.params.serverId), req.body.userId);
    res.sendStatus(201);
  });

  app.get("/api/channels/:channelId/members", async (req, res) => {
    const channel = await storage.getChannel(parseInt(req.params.channelId));
    if (!channel) return res.sendStatus(404);
    const members = await storage.getServerMembers(channel.serverId);
    const connectedMembers = members.map(member => ({
      ...member,
      isMuted: Math.random() > 0.5
    }));
    res.json(connectedMembers);
  });

  // Message routes
  app.get("/api/channels/:channelId/messages", async (req, res) => {
    const messages = await storage.getMessages(parseInt(req.params.channelId));
    res.json(messages);
  });

  app.post("/api/channels/:channelId/messages", async (req, res) => {
    const message = await storage.createMessage(
      parseInt(req.params.channelId),
      1, // Default user ID
      req.body.content
    );
    res.status(201).json(message);
  });


  // Reaction routes
  app.post("/api/messages/:messageId/reactions", async (req, res) => {
    const reaction = await storage.addReaction(
      parseInt(req.params.messageId),
      1, // Default user ID
      req.body.emoji
    );
    res.status(201).json(reaction);
  });

  app.delete("/api/messages/:messageId/reactions/:emoji", async (req, res) => {
    await storage.removeReaction(
      parseInt(req.params.messageId),
      1, // Default user ID
      req.params.emoji
    );
    res.sendStatus(200);
  });

  // Coin related routes
  app.get("/api/coins", async (req, res) => {
    const userCoins = await storage.getUserCoins(1); // Default user ID
    if (!userCoins) {
      const newUserCoins = await storage.createUserCoins(1); // Default user ID
      res.json(newUserCoins);
    } else {
      res.json(userCoins);
    }
  });

  app.post("/api/coins/daily-reward", async (req, res) => {
    try {
      const transaction = await storage.claimDailyReward(1); // Default user ID
      res.json(transaction);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  app.get("/api/coins/products", async (req, res) => {
    const products = await storage.getCoinProducts();
    res.json(products);
  });

  app.get("/api/achievements", async (req, res) => {
    const achievements = await storage.getUserAchievements(1); // Default user ID
    res.json(achievements);
  });

  // Gift related routes
  app.get("/api/gifts", async (req, res) => {
    const gifts = await storage.getGifts();
    res.json(gifts);
  });

  app.post("/api/gifts/send", async (req, res) => {
    try {
      const giftHistory = await storage.sendGift(
        1, // Default user ID
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
    const history = await storage.getGiftHistory(1); // Default user ID
    res.json(history);
  });

  // Level related routes
  app.get("/api/user/level", async (req, res) => {
    const userLevel = await storage.getUserLevel(1); // Default user ID
    res.json(userLevel);
  });

  app.post("/api/channels/:channelId/members", async (req, res) => {
    const channel = await storage.getChannel(parseInt(req.params.channelId));
    if (!channel) return res.sendStatus(404);

    await storage.addUserToPrivateChannel(
      parseInt(req.params.channelId),
      req.body.userId
    );
    res.sendStatus(200);
  });

  app.delete("/api/channels/:channelId/members/:userId", async (req, res) => {
    const channel = await storage.getChannel(parseInt(req.params.channelId));
    if (!channel) return res.sendStatus(404);

    await storage.removeUserFromPrivateChannel(
      parseInt(req.params.channelId),
      parseInt(req.params.userId)
    );
    res.sendStatus(200);
  });

  app.get("/api/channels/:channelId", async (req, res) => {
    const channelId = parseInt(req.params.channelId);
    const channel = await storage.getChannel(channelId);
    res.json(channel);
  });

  // Media related routes
  app.post("/api/channels/:channelId/media", async (req, res) => {
    try {
      const { url, type } = req.body;

      const media = {
        type,
        url,
        title: "Media Title", // Default title
        queuedBy: 1 // Default user ID
      };

      const channel = await storage.getChannel(parseInt(req.params.channelId));
      if (!channel?.currentMedia) {
        const updatedChannel = await storage.setChannelMedia(parseInt(req.params.channelId), media);
        res.json(updatedChannel);
      } else {
        const updatedChannel = await storage.addToMediaQueue(parseInt(req.params.channelId), media);
        res.json(updatedChannel);
      }
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post("/api/channels/:channelId/media/skip", async (req, res) => {
    try {
      const channel = await storage.getChannel(parseInt(req.params.channelId));
      if (!channel) return res.sendStatus(404);

      const updatedChannel = await storage.skipCurrentMedia(parseInt(req.params.channelId));
      res.json(updatedChannel);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.delete("/api/channels/:channelId/media/queue", async (req, res) => {
    try {
      const channel = await storage.getChannel(parseInt(req.params.channelId));
      if (!channel) return res.sendStatus(404);

      await storage.clearMediaQueue(parseInt(req.params.channelId));
      res.sendStatus(200);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // YouTube arama API'si
  app.get("/api/youtube/search", async (req, res) => {
    try {
      const query = req.query.q as string;
      const response = await fetch(
        `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(
          query
        )}&type=video&key=${process.env.YOUTUBE_API_KEY}`
      );

      const data = await response.json();

      if (data.error) {
        throw new Error(data.error.message);
      }

      res.json(data);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  const httpServer = createServer(app);

  // WebSocket sunucusunu kur
  const wss = new WebSocketServer({ 
    server: httpServer,
    path: '/ws'
  });

  wss.on('connection', (ws) => {
    console.log('🔌 Yeni WebSocket bağlantısı');

    ws.on('message', (message) => {
      try {
        const data = JSON.parse(message.toString());
        console.log('📨 Mesaj alındı:', data);

        // Mesajı diğer tüm bağlı istemcilere ilet
        wss.clients.forEach(client => {
          if (client !== ws && client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(data));
          }
        });
      } catch (error) {
        console.error('WebSocket mesaj işleme hatası:', error);
      }
    });

    ws.on('close', () => {
      console.log('❌ WebSocket bağlantısı kapandı');
    });

    ws.on('error', (error) => {
      console.error('WebSocket hatası:', error);
    });
  });

  return httpServer;
}