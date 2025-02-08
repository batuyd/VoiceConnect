import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from 'ws';
import { setupAuth, sessionSettings } from "./auth";
import { storage } from "./storage";

// Error handling helper
function handleError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export function registerRoutes(app: Express): Server {
  setupAuth(app);

  const httpServer = createServer(app);
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  // WebSocket bağlantılarını saklamak için Map
  const clients = new Map<number, WebSocket>();

  wss.on('connection', (ws: WebSocket, req: any) => {
    try {
      console.log('New WebSocket connection attempt');

      if (!req.session?.passport?.user) {
        console.log('WebSocket connection rejected: No authenticated user');
        ws.close();
        return;
      }

      const userId = req.session.passport.user;
      console.log('WebSocket connected for user:', userId);

      clients.set(userId, ws);

      ws.on('close', () => {
        console.log('WebSocket disconnected for user:', userId);
        clients.delete(userId);
      });

      // Send initial connection success message
      ws.send(JSON.stringify({
        type: 'CONNECTED',
        data: { userId }
      }));
    } catch (error) {
      console.error('WebSocket connection error:', error);
      ws.close();
    }
  });

  // Friend request routes
  app.get("/api/friends/requests", async (req, res) => {
    if (!req.user) return res.sendStatus(401);
    try {
      const requests = await storage.getPendingFriendRequests(req.user.id);
      res.json(requests);
    } catch (error) {
      console.error('Get friend requests error:', handleError(error));
      res.status(500).json({ message: "Failed to get friend requests" });
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

      // WebSocket üzerinden hedef kullanıcıya bildirim gönder
      const targetWs = clients.get(targetUser.id);
      if (targetWs && targetWs.readyState === WebSocket.OPEN) {
        try {
          targetWs.send(JSON.stringify({
            type: 'FRIEND_REQUEST',
            data: {
              id: friendship.id,
              senderId: req.user.id,
              receiverId: targetUser.id,
              status: friendship.status,
              createdAt: friendship.createdAt,
              sender: {
                id: req.user.id,
                username: req.user.username
              }
            }
          }));
          console.log('WebSocket friend request notification sent to user:', targetUser.id);
        } catch (wsError) {
          console.error('WebSocket send error:', wsError);
        }
      } else {
        console.log('Target user WebSocket not found or not open:', targetUser.id);
      }

      res.status(201).json(friendship);
    } catch (error: any) {
      console.error('Add friend error:', error);
      res.status(500).json({ message: "Failed to send friend request" });
    }
  });

  app.post("/api/channels/:channelId/signal", async (req, res) => {
    if (!req.user) return res.sendStatus(401);

    try {
      console.log('Received WebRTC signal:', {
        fromUser: req.user.id,
        targetUser: req.body.targetUserId,
        signalType: req.body.signal.type
      });

      const { targetUserId, signal } = req.body;
      const channelId = parseInt(req.params.channelId);

      // Get channel and check if it's a voice channel
      const channel = await storage.getChannel(channelId);
      if (!channel || !channel.isVoice) {
        return res.status(400).json({ error: "Invalid channel" });
      }

      // Check if both users are members of the channel
      const members = await storage.getServerMembers(channel.serverId);
      const isValidConnection = members.some(m => m.id === targetUserId) &&
                                members.some(m => m.id === req.user!.id);

      if (!isValidConnection) {
        console.log('Invalid connection attempt between users:', req.user.id, targetUserId);
        return res.status(403).json({ error: "Invalid connection attempt" });
      }

      // In a real implementation, you would use WebSocket or another real-time solution
      // For now, we just acknowledge the signal
      console.log('Successfully processed signal');
      res.json({ success: true });
    } catch (error) {
      console.error('WebRTC signaling error:', error);
      res.status(500).json({ message: "Failed to relay signal" });
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
  app.post("/api/channels/:channelId/messages", async (req, res) => {
    if (!req.user) return res.sendStatus(401);

    try {
      const channelId = parseInt(req.params.channelId);

      // Kanalın varlığını kontrol et
      const channel = await storage.getChannel(channelId);
      if (!channel) {
        return res.status(404).json({ message: "Kanal bulunamadı" });
      }

      // Mesaj içeriğini kontrol et
      if (!req.body.content || typeof req.body.content !== 'string') {
        return res.status(400).json({ message: "Mesaj içeriği gerekli" });
      }

      console.log('Creating message:', {
        channelId,
        userId: req.user.id,
        content: req.body.content
      });

      const message = await storage.createMessage(
        channelId,
        req.user.id,
        req.body.content
      );

      console.log('Message created:', message);

      const achievements = await storage.getUserAchievements(req.user.id);
      const messageAchievement = achievements.find(a => a.type === "messages");
      if (messageAchievement) {
        await storage.updateUserAchievement(req.user.id, "messages", messageAchievement.progress + 1);
      }

      res.status(201).json(message);
    } catch (error) {
      console.error('Post message error:', handleError(error));
      res.status(500).json({ message: "Failed to post message" });
    }
  });

  app.get("/api/channels/:channelId/messages", async (req, res) => {
    if (!req.user) return res.sendStatus(401);
    try {
      const channelId = parseInt(req.params.channelId);

      // Kanalın varlığını kontrol et
      const channel = await storage.getChannel(channelId);
      if (!channel) {
        return res.status(404).json({ message: "Kanal bulunamadı" });
      }

      console.log('Fetching messages for channel:', channelId);
      const messages = await storage.getMessages(channelId);
      console.log('Found messages:', messages.length);

      res.json(messages);
    } catch (error) {
      console.error('Get messages error:', handleError(error));
      res.status(500).json({ message: "Failed to get messages" });
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

  app.post("/api/friends/:friendshipId/accept", async (req, res) => {
    if (!req.user) return res.sendStatus(401);

    try {
      const friendshipId = parseInt(req.params.friendshipId);
      const friendship = await storage.getFriendshipById(friendshipId);

      if (!friendship) {
        return res.status(404).json({ message: "Friendship request not found" });
      }

      await storage.acceptFriendRequest(friendshipId);

      // WebSocket üzerinden arkadaşlık durumunun güncellendiğini bildirme
      const targetWs = clients.get(friendship.senderId);
      if (targetWs && targetWs.readyState === WebSocket.OPEN) {
        try {
          targetWs.send(JSON.stringify({
            type: 'FRIEND_REQUEST_ACCEPTED',
            data: {
              friendshipId,
              userId: req.user.id,
              username: req.user.username,
              senderId: friendship.senderId,
              receiverId: friendship.receiverId
            }
          }));
        } catch (wsError) {
          console.error('WebSocket send error:', wsError);
        }
      }

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

      if (isNaN(friendId)) {
        return res.status(400).json({ message: "Invalid friend ID" });
      }

      console.log(`Attempting to remove friendship between ${req.user.id} and ${friendId}`);

      await storage.removeFriend(req.user.id, friendId);

      // WebSocket üzerinden arkadaşlık durumunun güncellendiğini bildirme
      const targetWs = clients.get(friendId);
      if (targetWs && targetWs.readyState === WebSocket.OPEN) {
        try {
          targetWs.send(JSON.stringify({
            type: 'FRIENDSHIP_REMOVED',
            data: {
              userId: req.user.id,
              friendId: friendId
            }
          }));
        } catch (wsError) {
          console.error('WebSocket send error:', wsError);
          // WebSocket hatası arkadaşlık silme işlemini etkilememeli
        }
      }

      res.sendStatus(200);
    } catch (error: any) {
      console.error('Remove friend error:', error);
      res.status(500).json({ message: error.message || "Failed to remove friend" });
    }
  });

  app.delete("/api/servers/:serverId", async (req, res) => {
    if (!req.user) return res.sendStatus(401);
    try {
      await storage.deleteServer(parseInt(req.params.serverId), req.user.id);
      res.sendStatus(200);
    } catch (error) {      console.error('Delete server error:', handleError(error));
      res.status(400).json({ error: handleError(error) });
    }
  });

  return httpServer;
}