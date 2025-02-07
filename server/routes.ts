import type { Express } from "express";
import { createServer, type Server } from "http";
import { setupAuth } from "./auth";
import { storage } from "./storage";
import { WebSocketServer, WebSocket } from 'ws';
import session from 'express-session';
import type { User } from "@shared/schema";

// Track connected users globally
const connectedUsers = new Map<number, {
    ws: WebSocket;
    user: User;
    lastPing: number;
    currentChannel?: number;
}>();

// WebSocket notification helper
function sendWebSocketNotification(userId: number, notification: any) {
  const userConnection = connectedUsers.get(userId);
  if (userConnection && userConnection.ws.readyState === WebSocket.OPEN) {
    try {
      userConnection.ws.send(JSON.stringify(notification));
      console.log(`Notification sent to user ${userId}:`, notification);
      return true;
    } catch (error) {
      console.error(`Failed to send notification to user ${userId}:`, error);
      connectedUsers.delete(userId);
      return false;
    }
  }
  return false;
}

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

  // Server invite routes
  app.post("/api/servers/:serverId/invites", async (req, res) => {
    if (!req.user) return res.sendStatus(401);

    try {
      const server = await storage.getServer(parseInt(req.params.serverId));
      if (!server) return res.sendStatus(404);

      // Sadece sunucu sahibi davet gönderebilir
      if (server.ownerId !== req.user.id) {
        return res.sendStatus(403);
      }

      const invite = await storage.createServerInvite(
        parseInt(req.params.serverId),
        req.user.id,
        req.body.userId
      );

      res.status(201).json(invite);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  app.get("/api/invites", async (req, res) => {
    if (!req.user) return res.sendStatus(401);
    const invites = await storage.getServerInvitesByUser(req.user.id);
    res.json(invites);
  });

  app.post("/api/invites/:inviteId/accept", async (req, res) => {
    if (!req.user) return res.sendStatus(401);

    try {
      await storage.acceptServerInvite(parseInt(req.params.inviteId));
      res.sendStatus(200);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post("/api/invites/:inviteId/reject", async (req, res) => {
    if (!req.user) return res.sendStatus(401);

    try {
      await storage.rejectServerInvite(parseInt(req.params.inviteId));
      res.sendStatus(200);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
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

  // Friend related routes
  app.get("/api/friends/requests", async (req, res) => {
    if (!req.user) return res.sendStatus(401);
    try {
      const requests = await storage.getPendingFriendRequests(req.user.id);
      console.log('Pending friend requests for user', req.user.id, ':', requests);
      res.json(requests);
    } catch (error: any) {
      console.error('Get friend requests error:', error);
      res.status(500).json({ message: "Failed to get friend requests" });
    }
  });

  app.get("/api/friends", async (req, res) => {
    if (!req.user) return res.sendStatus(401);
    const friends = await storage.getFriends(req.user.id);
    res.json(friends);
  });

  app.post("/api/friends", async (req, res) => {
    if (!req.user) return res.sendStatus(401);

    try {
      const targetUser = await storage.getUserByUsername(req.body.username);
      if (!targetUser) {
        return res.status(404).json({ message: "User not found" });
      }

      if (targetUser.id === req.user.id) {
        return res.status(400).json({ message: "Cannot add yourself as a friend" });
      }

      // Check if already friends or pending request exists
      const existingFriendship = await storage.getFriendship(req.user.id, targetUser.id);
      if (existingFriendship) {
        if (existingFriendship.status === 'pending') {
          return res.status(400).json({ message: "Friend request already sent" });
        }
        return res.status(400).json({ message: "Already friends with this user" });
      }

      const friendship = await storage.createFriendRequest(req.user.id, targetUser.id);
      console.log('Created friend request:', friendship);

      // Send WebSocket notification to target user
      const notificationSent = sendWebSocketNotification(targetUser.id, {
        type: 'friend_request',
        from: {
          id: req.user.id,
          username: req.user.username,
          avatar: req.user.avatar
        },
        friendshipId: friendship.id
      });

      console.log(
        notificationSent
          ? `Notification sent to user ${targetUser.id}`
          : `User ${targetUser.id} is offline or notification failed`
      );

      res.status(201).json(friendship);
    } catch (error: any) {
      console.error('Add friend error:', error);
      res.status(500).json({ message: "Failed to send friend request" });
    }
  });

  app.post("/api/friends/:friendshipId/accept", async (req, res) => {
    if (!req.user) return res.sendStatus(401);

    try {
      const friendshipId = parseInt(req.params.friendshipId);
      const friendship = await storage.getFriendshipById(friendshipId);

      if (!friendship) {
        return res.status(404).json({ message: "Friendship request not found" });
      }

      await storage.acceptFriendRequest(friendshipId);

      // Notify the friend request sender
      sendWebSocketNotification(friendship.senderId, {
        type: 'friend_request_accepted',
        by: {
          id: req.user.id,
          username: req.user.username,
          avatar: req.user.avatar
        },
        friendshipId
      });

      res.sendStatus(200);
    } catch (error: any) {
      console.error('Accept friend request error:', error);
      res.status(500).json({ message: "Failed to accept friend request" });
    }
  });

  app.post("/api/friends/:friendshipId/reject", async (req, res) => {
    if (!req.user) return res.sendStatus(401);

    try {
      await storage.rejectFriendRequest(parseInt(req.params.friendshipId));
      res.sendStatus(200);
    } catch (error: any) {
      console.error('Reject friend request error:', error);
      res.status(500).json({ message: "Failed to reject friend request" });
    }
  });

  app.delete("/api/friends/:friendId", async (req, res) => {
    if (!req.user) return res.sendStatus(401);

    try {
      const friendId = parseInt(req.params.friendId);
      await storage.removeFriend(req.user.id, friendId);
      res.sendStatus(200);
    } catch (error: any) {
      console.error('Remove friend error:', error);
      res.status(500).json({ message: "Failed to remove friend" });
    }
  });

  const httpServer = createServer(app);

  // WebSocket server configuration
  const wss = new WebSocketServer({
    server: httpServer,
    path: '/ws',
    clientTracking: true,
    perMessageDeflate: false
  });

  // Session middleware for WebSocket
  const sessionParser = session({
    secret: process.env.REPL_ID!,
    resave: false,
    saveUninitialized: false,
    store: storage.sessionStore,
    cookie: {
      secure: app.get("env") === "production",
      sameSite: "strict",
    }
  });

  wss.on('connection', async (ws, req) => {
    console.log('New WebSocket connection attempt');

    try {
      // Parse session
      await new Promise((resolve, reject) => {
        sessionParser(req as any, {} as any, (err) => {
          if (err) {
            console.error('Session parsing error:', err);
            reject(err);
          } else {
            resolve(undefined);
          }
        });
      });

      // Check authentication
      const sessionData = (req as any).session;
      if (!sessionData?.passport?.user) {
        console.log('WebSocket authentication failed - no session data');
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
        console.log('WebSocket authentication failed - user not found');
        ws.send(JSON.stringify({
          type: 'error',
          message: 'User not found'
        }));
        ws.close();
        return;
      }

      console.log(`User ${userId} authenticated and connected via WebSocket`);

      // Add user to connected users
      connectedUsers.set(userId, {
        ws,
        user,
        lastPing: Date.now()
      });

      // Send initial connection success message
      ws.send(JSON.stringify({
        type: 'connection_established',
        userId: user.id,
        username: user.username
      }));

      // Handle incoming messages
      ws.on('message', async (message) => {
        try {
          const data = JSON.parse(message.toString());
          console.log(`Received message from user ${userId}:`, data);

          switch (data.type) {
            case 'ping':
              ws.send(JSON.stringify({ type: 'pong' }));
              break;

            case 'friend_request_response':
              try {
                if (data.accept) {
                  await storage.acceptFriendRequest(data.friendshipId);
                  const friendship = await storage.getFriendshipById(data.friendshipId);
                  if (friendship) {
                    sendWebSocketNotification(friendship.senderId, {
                      type: 'friend_request_accepted',
                      by: {
                        id: user.id,
                        username: user.username,
                        avatar: user.avatar
                      }
                    });
                  }
                } else {
                  await storage.rejectFriendRequest(data.friendshipId);
                }
              } catch (error) {
                console.error('Error handling friend request response:', error);
                ws.send(JSON.stringify({
                  type: 'error',
                  message: 'Failed to process friend request response'
                }));
              }
              break;

            default:
              console.log('Unknown message type:', data.type);
          }
        } catch (error) {
          console.error('Error processing message:', error);
          ws.send(JSON.stringify({
            type: 'error',
            message: 'Invalid message format'
          }));
        }
      });

      // Handle connection close
      ws.on('close', () => {
        console.log(`WebSocket connection closed for user ${userId}`);
        connectedUsers.delete(userId);
      });

      // Handle errors
      ws.on('error', (error) => {
        console.error(`WebSocket error for user ${userId}:`, error);
        connectedUsers.delete(userId);
      });

    } catch (error) {
      console.error('WebSocket connection error:', error);
      ws.close();
    }
  });

  // Cleanup inactive connections periodically
  setInterval(() => {
    const now = Date.now();
    connectedUsers.forEach((data, userId) => {
      if (now - data.lastPing > 60000) { // 1 minute timeout
        console.log('Cleaning up inactive connection for user:', userId);
        if (data.ws.readyState === WebSocket.OPEN) {
          data.ws.close();
        }
        connectedUsers.delete(userId);
      }
    });
  }, 30000); // Check every 30 seconds

  return httpServer;
}