import type { Express } from "express";
import { createServer, type Server } from "http";
import { setupAuth, sessionSettings } from "./auth";
import { storage } from "./storage";
import { WebSocketServer, WebSocket } from 'ws';
import session from 'express-session';
import type { User } from "@shared/schema";
import ytdl from 'ytdl-core';

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

// Error handling helper
function handleError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export function registerRoutes(app: Express): Server {
  setupAuth(app);

  // Friend request routes
  app.get("/api/friends/requests", async (req, res) => {
    if (!req.user) return res.sendStatus(401);
    try {
      const requests = await storage.getPendingFriendRequests(req.user.id);
      console.log('Pending friend requests for user', req.user.id, ':', requests);
      res.json(requests);
    } catch (error) {
      console.error('Get friend requests error:', handleError(error));
      res.status(500).json({ message: "Failed to get friend requests" });
    }
  });

  app.get("/api/servers", async (req, res) => {
    if (!req.user) return res.sendStatus(401);
    try {
      const servers = await storage.getServers(req.user.id);
      res.json(servers);
    } catch (error) {
      console.error('Get servers error:', handleError(error));
      res.status(500).json({ message: "Failed to get servers" });
    }
  });

  app.get("/api/servers/:serverId", async (req, res) => {
    if (!req.user) return res.sendStatus(401);
    try {
      const server = await storage.getServer(parseInt(req.params.serverId));
      if (!server) return res.sendStatus(404);
      res.json(server);
    } catch (error) {
      console.error('Get server error:', handleError(error));
      res.status(500).json({ message: "Failed to get server" });
    }
  });

  app.post("/api/servers", async (req, res) => {
    if (!req.user) return res.sendStatus(401);
    try {
      const server = await storage.createServer(req.body.name, req.user.id);
      res.status(201).json(server);
    } catch (error) {
      console.error('Create server error:', handleError(error));
      res.status(500).json({ message: "Failed to create server" });
    }
  });

  app.get("/api/servers/:serverId/channels", async (req, res) => {
    if (!req.user) return res.sendStatus(401);
    try {
      const channels = await storage.getChannels(parseInt(req.params.serverId));
      res.json(channels);
    } catch (error) {
      console.error('Get channels error:', handleError(error));
      res.status(500).json({ message: "Failed to get channels" });
    }
  });

  app.post("/api/servers/:serverId/channels", async (req, res) => {
    if (!req.user) return res.sendStatus(401);
    try {
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
    } catch (error) {
      console.error('Create channel error:', handleError(error));
      res.status(500).json({ message: "Failed to create channel" });
    }
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
      console.error('Delete channel error:', handleError(error));
      res.status(400).json({ error: handleError(error) });
    }
  });


  app.get("/api/servers/:serverId/members", async (req, res) => {
    if (!req.user) return res.sendStatus(401);
    try {
      const members = await storage.getServerMembers(parseInt(req.params.serverId));
      res.json(members);
    } catch (error) {
      console.error('Get server members error:', handleError(error));
      res.status(500).json({ message: "Failed to get server members" });
    }
  });

  app.post("/api/servers/:serverId/members", async (req, res) => {
    if (!req.user) return res.sendStatus(401);
    try {
      await storage.addServerMember(parseInt(req.params.serverId), req.body.userId);
      res.sendStatus(201);
    } catch (error) {
      console.error('Add server member error:', handleError(error));
      res.status(500).json({ message: "Failed to add server member" });
    }
  });

  app.get("/api/channels/:channelId/members", async (req, res) => {
    if (!req.user) return res.sendStatus(401);
    try {
      const channel = await storage.getChannel(parseInt(req.params.channelId));
      if (!channel) return res.sendStatus(404);
      const members = await storage.getServerMembers(channel.serverId);
      const connectedMembers = members.map(member => ({
        ...member,
        isMuted: Math.random() > 0.5
      }));
      res.json(connectedMembers);
    } catch (error) {
      console.error('Get channel members error:', handleError(error));
      res.status(500).json({ message: "Failed to get channel members" });
    }
  });

  app.patch("/api/user/profile", async (req, res) => {
    if (!req.user) return res.sendStatus(401);

    try {
      const updatedUser = await storage.updateUserProfile(req.user.id, {
        bio: req.body.bio,
        age: req.body.age,
        avatar: req.body.avatar,
      });

      res.json(updatedUser);
    } catch (error) {
      console.error('Update user profile error:', handleError(error));
      res.status(500).json({ message: "Failed to update user profile" });
    }
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
      console.error('Create server invite error:', handleError(error));
      res.status(400).json({ error: handleError(error) });
    }
  });

  app.get("/api/invites", async (req, res) => {
    if (!req.user) return res.sendStatus(401);
    try {
      const invites = await storage.getServerInvitesByUser(req.user.id);
      res.json(invites);
    } catch (error) {
      console.error('Get server invites error:', handleError(error));
      res.status(500).json({ message: "Failed to get server invites" });
    }
  });

  app.post("/api/invites/:inviteId/accept", async (req, res) => {
    if (!req.user) return res.sendStatus(401);

    try {
      await storage.acceptServerInvite(parseInt(req.params.inviteId));
      res.sendStatus(200);
    } catch (error) {
      console.error('Accept server invite error:', handleError(error));
      res.status(400).json({ error: handleError(error) });
    }
  });

  app.post("/api/invites/:inviteId/reject", async (req, res) => {
    if (!req.user) return res.sendStatus(401);

    try {
      await storage.rejectServerInvite(parseInt(req.params.inviteId));
      res.sendStatus(200);
    } catch (error) {
      console.error('Reject server invite error:', handleError(error));
      res.status(400).json({ error: handleError(error) });
    }
  });

  // Message routes
  app.get("/api/channels/:channelId/messages", async (req, res) => {
    if (!req.user) return res.sendStatus(401);
    try {
      const messages = await storage.getMessages(parseInt(req.params.channelId));
      res.json(messages);
    } catch (error) {
      console.error('Get messages error:', handleError(error));
      res.status(500).json({ message: "Failed to get messages" });
    }
  });

  app.post("/api/channels/:channelId/messages", async (req, res) => {
    if (!req.user) return res.sendStatus(401);

    try {
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
    } catch (error) {
      console.error('Post message error:', handleError(error));
      res.status(500).json({ message: "Failed to post message" });
    }
  });

  // Reaction routes
  app.post("/api/messages/:messageId/reactions", async (req, res) => {
    if (!req.user) return res.sendStatus(401);
    try {
      const reaction = await storage.addReaction(
        parseInt(req.params.messageId),
        req.user.id,
        req.body.emoji
      );
      res.status(201).json(reaction);
    } catch (error) {
      console.error('Add reaction error:', handleError(error));
      res.status(500).json({ message: "Failed to add reaction" });
    }
  });

  app.delete("/api/messages/:messageId/reactions/:emoji", async (req, res) => {
    if (!req.user) return res.sendStatus(401);
    try {
      await storage.removeReaction(
        parseInt(req.params.messageId),
        req.user.id,
        req.params.emoji
      );
      res.sendStatus(200);
    } catch (error) {
      console.error('Remove reaction error:', handleError(error));
      res.status(500).json({ message: "Failed to remove reaction" });
    }
  });

  // Coin related routes
  app.get("/api/coins", async (req, res) => {
    if (!req.user) return res.sendStatus(401);
    try {
      const userCoins = await storage.getUserCoins(req.user.id);
      if (!userCoins) {
        const newUserCoins = await storage.createUserCoins(req.user.id);
        res.json(newUserCoins);
      } else {
        res.json(userCoins);
      }
    } catch (error) {
      console.error('Get coins error:', handleError(error));
      res.status(500).json({ message: "Failed to get coins" });
    }
  });

  app.post("/api/coins/daily-reward", async (req, res) => {
    if (!req.user) return res.sendStatus(401);
    try {
      const transaction = await storage.claimDailyReward(req.user.id);
      res.json(transaction);
    } catch (error) {
      console.error('Claim daily reward error:', handleError(error));
      res.status(400).json({ error: handleError(error) });
    }
  });

  app.get("/api/coins/products", async (req, res) => {
    if (!req.user) return res.sendStatus(401);
    try {
      const products = await storage.getCoinProducts();
      res.json(products);
    } catch (error) {
      console.error('Get coin products error:', handleError(error));
      res.status(500).json({ message: "Failed to get coin products" });
    }
  });

  app.get("/api/achievements", async (req, res) => {
    if (!req.user) return res.sendStatus(401);
    try {
      const achievements = await storage.getUserAchievements(req.user.id);
      res.json(achievements);
    } catch (error) {
      console.error('Get achievements error:', handleError(error));
      res.status(500).json({ message: "Failed to get achievements" });
    }
  });

  // Gift related routes
  app.get("/api/gifts", async (req, res) => {
    if (!req.user) return res.sendStatus(401);
    try {
      const gifts = await storage.getGifts();
      res.json(gifts);
    } catch (error) {
      console.error('Get gifts error:', handleError(error));
      res.status(500).json({ message: "Failed to get gifts" });
    }
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
      console.error('Send gift error:', handleError(error));
      res.status(400).json({ error: handleError(error) });
    }
  });

  app.get("/api/gifts/history", async (req, res) => {
    if (!req.user) return res.sendStatus(401);
    try {
      const history = await storage.getGiftHistory(req.user.id);
      res.json(history);
    } catch (error) {
      console.error('Get gift history error:', handleError(error));
      res.status(500).json({ message: "Failed to get gift history" });
    }
  });

  // Level related routes
  app.get("/api/user/level", async (req, res) => {
    if (!req.user) return res.sendStatus(401);
    try {
      const userLevel = await storage.getUserLevel(req.user.id);
      res.json(userLevel);
    } catch (error) {
      console.error('Get user level error:', handleError(error));
      res.status(500).json({ message: "Failed to get user level" });
    }
  });

  app.post("/api/channels/:channelId/members", async (req, res) => {
    if (!req.user) return res.sendStatus(401);

    try {
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
    } catch (error) {
      console.error('Add user to private channel error:', handleError(error));
      res.status(500).json({ message: "Failed to add user to private channel" });
    }
  });

  app.delete("/api/channels/:channelId/members/:userId", async (req, res) => {
    if (!req.user) return res.sendStatus(401);

    try {
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
    } catch (error) {
      console.error('Remove user from private channel error:', handleError(error));
      res.status(500).json({ message: "Failed to remove user from private channel" });
    }
  });

  app.get("/api/channels/:channelId", async (req, res) => {
    if (!req.user) return res.sendStatus(401);

    try {
      const channelId = parseInt(req.params.channelId);
      const canAccess = await storage.canAccessChannel(channelId, req.user.id);

      if (!canAccess) {
        return res.sendStatus(403);
      }

      const channel = await storage.getChannel(channelId);
      res.json(channel);
    } catch (error) {
      console.error('Get channel error:', handleError(error));
      res.status(500).json({ message: "Failed to get channel" });
    }
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
      const errorMessage = handleError(error);
      console.error('Media error:', errorMessage);
      res.status(400).json({ error: errorMessage });
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
      console.error('Skip media error:', handleError(error));
      res.status(400).json({ error: handleError(error) });
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
      console.error('Clear media queue error:', handleError(error));
      res.status(400).json({ error: handleError(error) });
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
      console.error('YouTube search error:', handleError(error));
      res.status(400).json({ error: handleError(error) });
    }
  });

  // Friend related routes

  app.get("/api/friends", async (req, res) => {
    if (!req.user) return res.sendStatus(401);
    try {
      const friends = await storage.getFriends(req.user.id);
      res.json(friends);
    } catch (error) {
      console.error('Get friends error:', handleError(error));
      res.status(500).json({ message: "Failed to get friends" });
    }
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
    perMessageDeflate: false,
  });

  // WebSocket session middleware setup
  const sessionParser = session(sessionSettings);

  // WebSocket connection handler with improved logging and error handling
  wss.on('connection', async (ws, req) => {
    console.log('New WebSocket connection attempt', {
      timestamp: new Date().toISOString(),
      headers: req.headers,
      url: req.url,
      remoteAddress: req.socket.remoteAddress
    });

    try {
      // Parse session synchronously to ensure proper authentication
      await new Promise<void>((resolve, reject) => {
        sessionParser(req as any, {} as any, (err) => {
          if (err) {
            console.error('Session parsing error:', {
              error: handleError(err),
              timestamp: new Date().toISOString()
            });
            reject(err);
          } else {
            resolve();
          }
        });
      });

      // Check authentication
      const session = (req as any).session;
      if (!session?.passport?.user) {
        console.log('WebSocket authentication failed - no session', {
          timestamp: new Date().toISOString(),
          sessionData: session
        });
        ws.send(JSON.stringify({
          type: 'error',
          message: 'Authentication required'
        }));
        ws.close();
        return;
      }

      // Get user data
      const userId = session.passport.user;
      const user = await storage.getUser(userId);

      if (!user) {
        console.log('WebSocket authentication failed - user not found', {
          timestamp: new Date().toISOString(),
          userId
        });
        ws.send(JSON.stringify({
          type: 'error',
          message: 'User not found'
        }));
        ws.close();
        return;
      }

      console.log('WebSocket connection authenticated', {
        timestamp: new Date().toISOString(),
        userId: user.id,
        username: user.username
      });

      // Remove existing connection if any
      const existingConnection = connectedUsers.get(userId);
      if (existingConnection?.ws.readyState === WebSocket.OPEN) {
        existingConnection.ws.close();
      }

      // Add user to connected users
      connectedUsers.set(userId, {
        ws,
        user,
        lastPing: Date.now(),
      });

      // Send initial success message
      ws.send(JSON.stringify({
        type: 'connection_established',
        userId: user.id,
        username: user.username
      }));

      // Handle incoming messages
      ws.on('message', async (message) => {
        try {
          const data = JSON.parse(message.toString());
          console.log('WebSocket message received', {
            timestamp: new Date().toISOString(),
            userId,
            messageType: data.type,
            data
          });

          switch (data.type) {
            case 'ping':
              const userConnection = connectedUsers.get(userId);
              if (userConnection) {
                userConnection.lastPing = Date.now();
                ws.send(JSON.stringify({ type: 'pong' }));
              }
              break;

            default:
              console.log('Unknown message type', {
                timestamp: new Date().toISOString(),
                userId,
                type: data.type
              });
          }
        } catch (error) {
          console.error('Error processing message', {
            timestamp: new Date().toISOString(),
            userId,
            error: handleError(error),
            rawMessage: message.toString()
          });
          ws.send(JSON.stringify({
            type: 'error',
            message: 'Invalid message format'
          }));
        }
      });

      // Handle connection close
      ws.on('close', () => {
        console.log('WebSocket connection closed', {
          timestamp: new Date().toISOString(),
          userId,
          username: user.username
        });
        connectedUsers.delete(userId);
      });

      // Handle errors
      ws.on('error', (error) => {
        console.error('WebSocket connection error', {
          timestamp: new Date().toISOString(),
          userId,
          error: handleError(error)
        });
        connectedUsers.delete(userId);
      });

    } catch (error) {
      console.error('WebSocket connection setup error', {
        timestamp: new Date().toISOString(),
        error: handleError(error)
      });
      ws.close();
    }
  });

  // Cleanup inactive connections every 30 seconds
  setInterval(() => {
    const now = Date.now();
    for (const [userId, connection] of connectedUsers) {
      // Close connection if no ping received in last 60 seconds
      if (now - connection.lastPing > 60000) {
        console.log(`Cleaning up inactive connection for user ${userId}`);
        if (connection.ws.readyState === WebSocket.OPEN) {
          connection.ws.close();
        }
        connectedUsers.delete(userId);
      }
    }
  }, 30000);

  return httpServer;
}