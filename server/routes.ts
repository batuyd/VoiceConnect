import type { Express } from "express";
import { createServer, type Server } from "http";
import { setupAuth } from "./auth";
import { storage } from "./storage";
import ytdl from 'ytdl-core';
import { WebSocketServer, WebSocket } from 'ws';
import NodeMediaServer from 'node-media-server';
import fetch from 'node-fetch';
import session from 'express-session';

export function registerRoutes(app: Express): Server {
  setupAuth(app);

  // Bot kullanıcısını oluştur
  app.post("/api/debug/create-bot", async (req, res) => {
    if (!req.user) return res.sendStatus(401);

    const botUser = await storage.createUser({
      username: "TestBot",
      password: "bot123", // Bu sadece test için
    });

    // Bot'u sunucuya ekle
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

    try {
      const channelId = parseInt(req.params.channelId);
      const channel = await storage.getChannel(channelId);

      if (!channel) {
        return res.status(404).json({ error: "Channel not found" });
      }

      // Check if user has access to channel
      const canAccess = await storage.canAccessChannel(channelId, req.user.id);
      if (!canAccess) {
        return res.status(403).json({ error: "Access denied" });
      }

      const message = await storage.createMessage(
        channelId,
        req.user.id,
        req.body.content
      );

      // WebSocket ile diğer kullanıcılara bildir
      wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({
            type: 'new_message',
            channelId: channelId,
            message
          }));
        }
      });

      res.status(201).json(message);
    } catch (error) {
      console.error('Message creation error:', error);
      res.status(400).json({ error: error instanceof Error ? error.message : 'Unknown error' });
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
  const mediaServerConfig = {
    rtmp: {
      port: parseInt(process.env.RTMP_PORT || '1936'), // Port değiştirildi
      chunk_size: 60000,
      gop_cache: true,
      ping: 30,
      ping_timeout: 60,
      host: '0.0.0.0'
    },
    http: {
      port: parseInt(process.env.MEDIA_HTTP_PORT || '8001'),
      host: '0.0.0.0',
      mediaroot: './media',
      allow_origin: '*',
      cors: {
        origin: '*',
        methods: 'GET,POST,OPTIONS',
        allowedHeaders: 'Content-Type'
      }
    }
  };

  const nms = new NodeMediaServer(mediaServerConfig);

  // WebSocket server configuration
  const wss = new WebSocketServer({
    server: httpServer,
    path: '/ws',
    clientTracking: true,
    perMessageDeflate: false
  });

  wss.on('connection', async (ws, req) => {
    console.log('New WebSocket connection established');

    try {
      // Parse session
      await new Promise((resolve, reject) => {
        session({
          secret: process.env.REPL_ID!,
          resave: true,
          saveUninitialized: true,
          store: storage.sessionStore
        })(req as any, {} as any, (err) => {
          if (err) reject(err);
          else resolve(undefined);
        });
      });

      // Check authentication
      const sessionData = (req as any).session;
      if (!sessionData?.passport?.user) {
        ws.send(JSON.stringify({
          type: 'error',
          message: 'Authentication required'
        }));
        ws.close();
        return;
      }

      // Get user data
      const userId = sessionData.passport.user;
      const user = await storage.getUser(userId);
      if (!user) {
        ws.send(JSON.stringify({
          type: 'error',
          message: 'User not found'
        }));
        ws.close();
        return;
      }

      ws.on('error', (error) => {
        console.error('WebSocket error:', error);
      });

      ws.on('message', async (message) => {
        try {
          const data = JSON.parse(message.toString());
          console.log('Received message:', data);

          if (data.type === 'join_channel') {
            const channel = await storage.getChannel(data.channelId);
            if (!channel) {
              ws.send(JSON.stringify({
                type: 'error',
                message: 'Channel not found'
              }));
              return;
            }

            // Check if user has access to channel
            const canAccess = await storage.canAccessChannel(data.channelId, userId);
            if (!canAccess) {
              ws.send(JSON.stringify({
                type: 'error',
                message: 'Access denied'
              }));
              return;
            }

            if (channel?.currentMedia) {
              ws.send(JSON.stringify({
                type: 'media_state',
                channelId: data.channelId,
                media: channel.currentMedia,
                queue: channel.mediaQueue || []
              }));
            }

            // Notify other clients about member update
            wss.clients.forEach((client) => {
              if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({
                  type: 'member_update',
                  channelId: data.channelId,
                  userId: userId
                }));
              }
            });
          }
        } catch (error) {
          console.error('Error processing WebSocket message:', error);
          ws.send(JSON.stringify({
            type: 'error',
            message: 'Invalid message format'
          }));
        }
      });

      // Add ping-pong mechanism with error handling
      const pingInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          try {
            ws.ping();
          } catch (error) {
            console.error('Ping error:', error);
            clearInterval(pingInterval);
            if (ws.readyState === WebSocket.OPEN) {
              ws.close();
            }
          }
        }
      }, 30000);

      ws.on('close', () => {
        console.log('WebSocket connection closed');
        clearInterval(pingInterval);
      });

    } catch (error) {
      console.error('WebSocket connection error:', error);
      ws.close();
    }
  });

  // Start media server
  try {
    nms.run();
    console.log('Media server started successfully');
  } catch (error) {
    console.error('Failed to start media server:', error);
  }

  return httpServer;
}