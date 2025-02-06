import type { Express } from "express";
import { createServer, type Server } from "http";
import { setupAuth } from "./auth";
import { storage } from "./storage";
import { WebSocketServer, WebSocket } from 'ws';
import NodeMediaServer from 'node-media-server';
import fetch from 'node-fetch';

export function registerRoutes(app: Express): Server {
  const sessionMiddleware = setupAuth(app);

  // Bot kullanıcısını oluştur
  app.post("/api/debug/create-bot", async (req, res) => {
    if (!req.user) return res.sendStatus(401);

    const botUser = await storage.createUser({
      username: "TestBot",
      password: "bot123", // Bu sadece test için
    });

    if (req.body.serverId) {
      await storage.addServerMember(req.body.serverId, botUser.id);
    }

    res.status(201).json(botUser);
  });

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
    // Premium kullanıcı kontrolü
    if (req.body.isPrivate) {
      const hasSubscription = await storage.hasActiveSubscription(req.user.id);
      if (!hasSubscription) {
        return res.status(403).json({ error: "Bu özellik sadece premium üyelere açıktır" });
      }
    }

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
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
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

  app.post("/api/channels/:channelId/members", async (req, res) => {
    if (!req.user) return res.sendStatus(401);

    const channel = await storage.getChannel(parseInt(req.params.channelId));
    if (!channel) return res.sendStatus(404);

    const server = await storage.getServer(channel.serverId);
    if (!server || server.ownerId !== req.user.id) {
      return res.sendStatus(403);
    }

    await storage.addUserToPrivateChannel(
      parseInt(req.params.channelId),
      req.body.userId
    );
    res.sendStatus(200);
  });

  app.delete("/api/channels/:channelId/members/:userId", async (req, res) => {
    if (!req.user) return res.sendStatus(401);

    const channel = await storage.getChannel(parseInt(req.params.channelId));
    if (!channel) return res.sendStatus(404);

    const server = await storage.getServer(channel.serverId);
    if (!server || server.ownerId !== req.user.id) {
      return res.sendStatus(403);
    }

    await storage.removeUserFromPrivateChannel(
      parseInt(req.params.channelId),
      parseInt(req.params.userId)
    );
    res.sendStatus(200);
  });

  app.get("/api/channels/:channelId", async (req, res) => {
    if (!req.user) return res.sendStatus(401);

    const channelId = parseInt(req.params.channelId);
    const canAccess = await storage.canAccessChannel(channelId, req.user.id);

    if (!canAccess) {
      return res.sendStatus(403);
    }

    const channel = await storage.getChannel(channelId);
    res.json(channel);
  });

  // Media related routes
  app.post("/api/channels/:channelId/media", async (req, res) => {
    if (!req.user) return res.sendStatus(401);

    try {
      const { url, type } = req.body;
      const videoInfo = await ytdl.getInfo(url);

      const media = {
        type,
        url,
        title: videoInfo.videoDetails.title,
        queuedBy: req.user.id
      };

      const channel = await storage.getChannel(parseInt(req.params.channelId));
      if (!channel?.currentMedia) {
        const updatedChannel = await storage.setChannelMedia(parseInt(req.params.channelId), media);
        res.json(updatedChannel);
      } else {
        const updatedChannel = await storage.addToMediaQueue(parseInt(req.params.channelId), media);
        res.json(updatedChannel);
      }
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post("/api/channels/:channelId/media/skip", async (req, res) => {
    if (!req.user) return res.sendStatus(401);

    try {
      const channel = await storage.getChannel(parseInt(req.params.channelId));
      if (!channel) return res.sendStatus(404);

      const server = await storage.getServer(channel.serverId);
      if (!server || server.ownerId !== req.user.id) {
        return res.sendStatus(403);
      }

      const updatedChannel = await storage.skipCurrentMedia(parseInt(req.params.channelId));
      res.json(updatedChannel);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  app.delete("/api/channels/:channelId/media/queue", async (req, res) => {
    if (!req.user) return res.sendStatus(401);

    try {
      const channel = await storage.getChannel(parseInt(req.params.channelId));
      if (!channel) return res.sendStatus(404);

      const server = await storage.getServer(channel.serverId);
      if (!server || server.ownerId !== req.user.id) {
        return res.sendStatus(403);
      }

      await storage.clearMediaQueue(parseInt(req.params.channelId));
      res.sendStatus(200);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  // YouTube arama API'si
  app.get("/api/youtube/search", async (req, res) => {
    if (!req.user) return res.sendStatus(401);

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

  // Media streaming server configuration
  const nms = new NodeMediaServer({
    rtmp: {
      port: 1935,
      chunk_size: 60000,
      gop_cache: true,
      ping: 30,
      ping_timeout: 60
    },
    http: {
      port: 8000,
      mediaroot: './media',
      allow_origin: '*'
    }
  });

  // WebSocket sunucusu yapılandırması
  const wss = new WebSocketServer({
    server: httpServer,
    path: '/ws'
  });

  // WebSocket bağlantı yönetimi
  wss.on('connection', async (ws, req) => {
    console.log('New WebSocket connection attempt');

    try {
      // Session middleware'i uygula
      await new Promise((resolve, reject) => {
        sessionMiddleware(req as any, {} as any, (err: any) => {
          if (err) {
            console.error('Session middleware error:', err);
            reject(err);
          } else {
            resolve(undefined);
          }
        });
      });

      const session = (req as any).session;
      if (!session?.passport?.user) {
        console.error('No session or user found');
        ws.send(JSON.stringify({
          type: 'error',
          message: 'Authentication required'
        }));
        ws.close();
        return;
      }

      const userId = session.passport.user;
      const user = await storage.getUser(userId);
      if (!user) {
        console.error('User not found:', userId);
        ws.send(JSON.stringify({
          type: 'error',
          message: 'User not found'
        }));
        ws.close();
        return;
      }

      console.log('WebSocket connection authenticated for user:', user.username);

      // Hata yönetimi
      ws.on('error', (error) => {
        console.error('WebSocket error:', error);
      });

      // Mesaj işleme
      ws.on('message', async (message) => {
        try {
          const data = JSON.parse(message.toString());
          console.log('Received message:', data);

          switch (data.type) {
            case 'join_room':
              console.log('User joining room:', data.channelId);
              wss.clients.forEach((client) => {
                if (client !== ws && client.readyState === WebSocket.OPEN) {
                  client.send(JSON.stringify({
                    type: 'user_joined',
                    userId: userId,
                    username: user.username
                  }));
                }
              });
              break;

            case 'offer':
              console.log('Forwarding offer from:', userId);
              wss.clients.forEach((client) => {
                if (client !== ws && client.readyState === WebSocket.OPEN) {
                  client.send(JSON.stringify({
                    type: 'offer',
                    from: userId,
                    offer: data.offer
                  }));
                }
              });
              break;

            case 'answer':
              console.log('Forwarding answer from:', userId);
              wss.clients.forEach((client) => {
                if (client !== ws && client.readyState === WebSocket.OPEN) {
                  client.send(JSON.stringify({
                    type: 'answer',
                    from: userId,
                    answer: data.answer
                  }));
                }
              });
              break;

            case 'ice-candidate':
              console.log('Forwarding ICE candidate from:', userId);
              wss.clients.forEach((client) => {
                if (client !== ws && client.readyState === WebSocket.OPEN) {
                  client.send(JSON.stringify({
                    type: 'ice-candidate',
                    from: userId,
                    candidate: data.candidate
                  }));
                }
              });
              break;
          }
        } catch (error) {
          console.error('Error processing WebSocket message:', error);
          ws.send(JSON.stringify({
            type: 'error',
            message: 'Invalid message format'
          }));
        }
      });

      // Bağlantı kapatma
      ws.on('close', () => {
        console.log('WebSocket connection closed for user:', user.username);
        wss.clients.forEach((client) => {
          if (client !== ws && client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({
              type: 'user_disconnected',
              userId: userId,
              username: user.username
            }));
          }
        });
      });

    } catch (error) {
      console.error('WebSocket connection error:', error);
      ws.close();
    }
  });

  // Start media server
  nms.run();
  console.log('Media server started with RTMP port:', 1935, 'and HTTP port:', 8000);

  return httpServer;
}