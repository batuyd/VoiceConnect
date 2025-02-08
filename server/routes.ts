import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from 'ws';
import { setupAuth, sessionSettings } from "./auth";
import { storage } from "./storage";
import session from 'express-session';

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

  wss.on('connection', async (ws: WebSocket, req: any) => {
    try {
      console.log('New WebSocket connection attempt');

      // Session parsing
      const sessionParser = session(sessionSettings);
      await new Promise((resolve) => {
        sessionParser(req, {} as any, resolve as any);
      });

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
      console.log('Getting friend requests for user:', req.user.id);
      const requests = await storage.getPendingFriendRequests(req.user.id);
      console.log('Found friend requests:', requests);
      res.json(requests);
    } catch (error) {
      console.error('Get friend requests error:', handleError(error));
      res.status(500).json({ message: "Failed to get friend requests" });
    }
  });

  app.post("/api/friends", async (req, res) => {
    if (!req.user) return res.sendStatus(401);

    try {
      console.log('Adding friend request:', req.body);

      const targetUser = await storage.getUserByUsername(req.body.username);
      if (!targetUser) {
        return res.status(404).json({ message: "User not found" });
      }

      if (targetUser.id === req.user.id) {
        return res.status(400).json({ message: "Cannot add yourself as a friend" });
      }

      const existingFriendship = await storage.getFriendship(req.user.id, targetUser.id);
      if (existingFriendship) {
        if (existingFriendship.status === 'accepted') {
          return res.status(400).json({ message: "Already friends with this user" });
        } else {
          return res.status(400).json({ message: "Friend request already exists" });
        }
      }

      console.log('Creating friend request from', req.user.id, 'to', targetUser.id);

      const friendship = await storage.createFriendRequest(req.user.id, targetUser.id);
      console.log('Created friend request:', friendship);

      // Notify target user about new friend request
      const targetWs = clients.get(targetUser.id);
      if (targetWs?.readyState === WebSocket.OPEN) {
        targetWs.send(JSON.stringify({
          type: 'FRIEND_REQUEST',
          data: {
            ...friendship,
            sender: {
              id: req.user.id,
              username: req.user.username
            }
          }
        }));
        console.log('WebSocket friend request notification sent to user:', targetUser.id);
      }

      // Notify sender about request being sent
      const senderWs = clients.get(req.user.id);
      if (senderWs?.readyState === WebSocket.OPEN) {
        senderWs.send(JSON.stringify({
          type: 'FRIEND_REQUEST_SENT',
          data: {
            ...friendship,
            sender: {
              id: req.user.id,
              username: req.user.username
            }
          }
        }));
        console.log('WebSocket friend request sent notification sent to sender:', req.user.id);
      }

      res.status(201).json(friendship);
    } catch (error: any) {
      console.error('Add friend error:', error);
      res.status(400).json({ message: error.message || "Failed to send friend request" });
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

      // Notify the sender about accepted request
      const senderWs = clients.get(friendship.senderId);
      if (senderWs?.readyState === WebSocket.OPEN) {
        senderWs.send(JSON.stringify({
          type: 'FRIEND_REQUEST_ACCEPTED',
          data: {
            friendshipId,
            userId: req.user.id,
            username: req.user.username,
            senderId: friendship.senderId,
            receiverId: friendship.receiverId
          }
        }));
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
      const friendshipId = parseInt(req.params.friendshipId);
      const friendship = await storage.getFriendshipById(friendshipId);

      if (!friendship) {
        return res.status(404).json({ message: "Friendship request not found" });
      }

      await storage.rejectFriendRequest(friendshipId);

      // Notify the receiver about rejected request
      const receiverWs = clients.get(friendship.receiverId);
      if (receiverWs?.readyState === WebSocket.OPEN) {
        receiverWs.send(JSON.stringify({
          type: 'FRIEND_REQUEST_REJECTED',
          data: {
            friendshipId,
            userId: req.user.id,
            username: req.user.username,
            senderId: friendship.senderId,
            receiverId: friendship.receiverId
          }
        }));
      }

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

      // WebSocket üzerinden arkadaşlık durumunun güncelllendiğini bildirme
      const targetWs = clients.get(friendId);
      if (targetWs && targetWs.readyState === WebSocket.OPEN) {
        try {
          targetWs.send(JSON.stringify({
            type: 'FRIENDSHIP_REMOVED',
            data: {
              userId: req.user.id,
              friendId: friendId,
              username: req.user.username
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
    } catch (error) {
      console.error('Delete server error:', handleError(error));
      res.status(400).json({ error: handleError(error) });
    }
  });

  return httpServer;
}