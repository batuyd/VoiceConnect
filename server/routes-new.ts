import type { Express, Request, Response, RequestHandler } from "express";
import { createServer, type Server } from "http";
import { setMaxListeners } from "events";
import { WebSocketServer, WebSocket } from "ws";
import { setupAuth, sessionSettings } from "./auth";
import { storage } from "./storage";
import session from "express-session";
import ytdl from "ytdl-core";
import cors from "cors";
import cookieParser from "cookie-parser";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import cookie from "cookie";
import pgSession from "connect-pg-simple";
import pkg from "pg";
import bcrypt from "bcrypt"; // bcrypt modülünü ekleyin

declare module "express-session" {
  interface SessionData {
    passport?: { user?: number };
  }
}

// Tip tanımlamalarını ekleyin
import "cors";
import "cookie";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface WebSocketClient extends WebSocket {
  isAlive: boolean;
  userId?: number;
}

function handleError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function sendWebSocketMessage(
  ws: WebSocketClient | undefined,
  type: string,
  data: any
) {
  if (ws?.readyState === WebSocket.OPEN) {
    try {
      ws.send(JSON.stringify({ type, data }));
      return true;
    } catch (error) {
      console.error(`❌ WebSocket gönderme hatası (${type}):`, error);
      return false;
    }
  }
  return false;
}

export function registerRoutes(app: Express): Server {
  const sessionMiddleware = session({
    secret: process.env.SESSION_SECRET || "65458598_super_secret_key!@#$",
    resave: false,
    saveUninitialized: false,
    proxy: true, // Reverse proxy kullanımında gerekli
    cookie: {
      secure: false, // Geliştirme ortamında false olmalı
      httpOnly: false,
      sameSite: "lax",
      maxAge: 24 * 60 * 60 * 1000, // 24 saat
    },
  });

  console.log("✅ Oturum Middleware Yüklendi!");
  console.log(
    "🔐 Oturum Secret:",
    process.env.SESSION_SECRET ? "Bulundu" : "BULUNAMADI!"
  );
  console.log("📢 Oturum Durumu:", sessionMiddleware);

  // ✅ CORS Middleware'i Güncelle
  app.use(
    cors({
      origin: "http://localhost:3000", // Frontend hangi portta çalışıyorsa ona göre ayarla
      credentials: true, // 🍪 Çerezlerin gönderilmesine izin ver
      methods: ["GET", "POST", "PUT", "DELETE"],
      allowedHeaders: ["Content-Type", "Authorization"]
    })
  );

  app.use(cookieParser());
  app.use(sessionMiddleware);
  setupAuth(app);

  const httpServer = createServer(app);
  const wss = new WebSocketServer({
    server: httpServer,
    path: "/ws",
    clientTracking: true,
    verifyClient: (info, done) => {
      const cookies = cookie.parse(info.req.headers.cookie || "");
      console.log("📢 WebSocket İçin Gelen Çerezler:", cookies);

      if (!cookies["connect.sid"]) {
        console.log("❌ Oturum çerezi eksik, bağlantı reddedildi!");
        return done(false, 401, "Unauthorized");
      }
      done(true);
    }
  });

  wss.on("connection", async (ws: WebSocketClient, req: Request) => {
    try {
      console.log("🔍 Yeni WebSocket bağlantısı denendi...");
      console.log("📢 WebSocket Başlıkları:", req.headers);
      console.log("📢 Gelen Çerezler:", req.headers.cookie || "❌ Çerez Yok!");

      if (!req.headers.cookie) {
        console.log("❌ WebSocket bağlantısı için çerez bulunamadı. Bağlantı kapatılıyor!");
        ws.close(1008, "Çerez eksik!");
        return;
      }

      // Çerezleri ayrıştır
      const cookies = cookie.parse(req.headers.cookie || "");
      console.log("📢 Ayrıştırılan Çerezler:", cookies);

      const sessionId = cookies["connect.sid"];
      if (!sessionId) {
        console.log("❌ Oturum çerezi bulunamadı, bağlantı kapatılıyor!");
        ws.close(1008, "Yetkisiz erişim");
        return;
      }

      // Oturum Middleware uygulaması
      await new Promise<void>((resolve, reject) => {
        sessionMiddleware(req as any, {} as any, (err: any) => {
          if (err) {
            console.error("❌ Oturum middleware hatası:", err);
            ws.close(1011, "İç Sunucu Hatası");
            reject(err);
            return;
          }
          resolve();
        });
      });

      const session = (req as any).session;
      console.log("📢 Oturum Verisi:", JSON.stringify(session, null, 2));

      if (!session?.passport?.user) {
        console.log("❌ Yetkilendirilmiş kullanıcı oturumda bulunamadı, bağlantı kapatılıyor!");
        ws.close(1008, "Yetkisiz erişim");
        return;
      }

      console.log("✅ WebSocket bağlantısı yetkilendirildi, kullanıcı ID:", session.passport.user);
      ws.userId = session.passport.user; // Kullanıcı ID'sini WebSocket nesnesine ekle

      // Ping-pong ile bağlantı kontrolü
      ws.isAlive = true;
      ws.on("pong", () => {
        ws.isAlive = true;
      });

      // WebSocket mesajlarını dinle
      ws.on("message", (message) => {
        console.log("📩 WebSocket mesajı alındı:", message.toString());
      });

      ws.on("close", () => {
        console.log(`❌ Kullanıcı ${ws.userId} WebSocket bağlantısını kapattı.`);
      });

    } catch (error) {
      console.error("❌ WebSocket bağlantı hatası:", error);
      ws.close(1011, "İç Sunucu Hatası");
    }
  });

  // Ping-Pong mekanizması ile bağlantı kontrolü
  setInterval(() => {
    wss.clients.forEach((ws) => {
      const client = ws as WebSocketClient;
      if (!client.isAlive) {
        console.log("⚠️ WebSocket bağlantısı yanıt vermedi, kapatılıyor...");
        return client.terminate();
      }
      client.isAlive = false;
      client.ping();
    });
  }, 30000);

  // **Ekstra Kodlar İçin Boşluk**
  setMaxListeners(20);

  const clients = new Map<number, WebSocketClient>();

  function heartbeat(this: WebSocketClient) {
    this.isAlive = true;
  }

  const interval = setInterval(() => {
    wss.clients.forEach((ws) => {
      const client = ws as WebSocketClient;
      if (client.isAlive === false) {
        if (client.userId) {
          clients.delete(client.userId);
        }
        return client.terminate();
      }

      client.isAlive = false;
      client.ping();
    });
  }, 30000);

  wss.on('connection', async (ws: WebSocketClient, req: Request) => {
    try {
      console.log('New WebSocket connection established');
      ws.isAlive = true;
      ws.on('pong', heartbeat.bind(ws as WebSocketClient));

      if (!req.session || !req.session.passport || !req.session.passport.user) {
        console.log('❌ WebSocket bağlantısı reddedildi: Kimlik doğrulama başarısız');
        ws.close(1008, 'Yetkisiz erişim');
        return;
      }

      const userId = req.session.passport.user;
      ws.userId = userId;
      console.log(`WebSocket authenticated for user: ${userId}`);

      // Handle existing connection
      const existingWs = clients.get(userId);
      if (existingWs) {
        console.log('Closing existing connection for user:', userId);
        existingWs.close(1000, 'New connection established');
        clients.delete(userId);
      }

      clients.set(userId, ws);

      ws.on('close', () => {
        console.log(`WebSocket disconnected for user: ${userId}`);
        clients.delete(userId);
      });

      ws.on('error', (error) => {
        console.error('WebSocket error for user:', userId, error);
        clients.delete(userId);
      });

      ws.on('message', async (message: string) => {
        try {
          const data = JSON.parse(message.toString());
          console.log('Received message from user:', userId, data);

          switch (data.type) {
            case 'ping':
              sendWebSocketMessage(ws, 'pong', { timestamp: Date.now() });
              break;
            case 'join_channel':
              try {
                const channelId = data.channelId;
                const channel = await storage.getChannel(channelId);

                if (!channel) {
                  sendWebSocketMessage(ws, 'error', { message: 'Channel not found' });
                  return;
                }

                // Kullanıcının kanala erişim iznini kontrol et
                const canAccess = await storage.canAccessChannel(channelId, userId);
                if (!canAccess) {
                  sendWebSocketMessage(ws, 'error', { message: 'Access denied' });
                  return;
                }

                console.log(`User ${userId} joined channel ${channelId}`);
                sendWebSocketMessage(ws, 'channel_joined', { 
                  channelId,
                  timestamp: Date.now()
                });
              } catch (error) {
                console.error('Error joining channel:', error);
                sendWebSocketMessage(ws, 'error', { message: 'Failed to join channel' });
              }
              break;
            default:
              console.log('Unknown message type:', data.type);
          }
        } catch (error) {
          console.error('❌ WebSocket mesajı işlenirken hata oluştu:', error);
          sendWebSocketMessage(ws, 'error', { message: 'Geçersiz mesaj formatı veya içeriği' });
        }
      });

      // Send connection confirmation
      sendWebSocketMessage(ws, 'CONNECTED', {
        userId,
        timestamp: Date.now()
      });

    } catch (error) {
      console.error('WebSocket connection error:', error);
      if (ws.readyState === WebSocket.OPEN) {
        ws.close(1011, 'Internal Server Error');
      }
    }
  });

  wss.on('close', () => {
    clearInterval(interval);
  });

  // Middleware to ensure the user is authenticated
  function ensureAuthenticated(req: Request, res: Response, next: Function) {
    if (!req.user) {
      return res.sendStatus(401);
    }
    next();
  }

  // Middleware to ensure the user is a member of the server
  async function ensureServerMember(req: Request, res: Response, next: Function) {
    const serverId = parseInt(req.params.serverId);
    const userId = req.user?.id;

    if (!userId) {
      return res.sendStatus(401);
    }

    const isMember = await storage.isServerMember(serverId, userId);
    if (!isMember) {
      return res.sendStatus(403);
    }

    next();
  }

  // Middleware to ensure the user is the owner of the server
  async function ensureServerOwner(req: Request, res: Response, next: Function) {
    const serverId = parseInt(req.params.serverId);
    const userId = req.user?.id;

    if (!userId) {
      return res.sendStatus(401);
    }

    const server = await storage.getServer(serverId);
    if (!server || server.ownerId !== userId) {
      return res.sendStatus(403);
    }

    next();
  }

  // Middleware to ensure the user is an admin of the server
  async function ensureServerAdmin(req: Request, res: Response, next: Function) {
    const serverId = parseInt(req.params.serverId);
    const userId = req.user?.id;

    if (!userId) {
      return res.sendStatus(401);
    }

    const server = await storage.getServer(serverId);
    if (server.ownerId === userId) {
      // Kullanıcı sunucu sahibi ise tüm yetkilere sahip olmalı
      return next();
    }

    const isAdmin = await storage.isServerAdmin(serverId, userId);
    if (!isAdmin) {
      return res.sendStatus(403);
    }

    next();
  }

  // Apply middleware to routes
  app.use("/api/servers/:serverId/*", ensureAuthenticated, ensureServerMember);

  // Friend request routes
  app.get("/api/friends/requests", ensureAuthenticated, async (req: Request, res: Response) => {
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

  app.post("/api/friends", ensureAuthenticated, async (req: Request, res: Response) => {
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

      const friendship = await storage.createFriendRequest(req.user.id, targetUser.id);
      console.log('Created friend request:', friendship);

      // Hedef kullanıcıya bildirim gönder
      sendWebSocketMessage(clients.get(targetUser.id), 'FRIEND_REQUEST', {
        id: friendship.id,
        senderId: req.user.id,
        receiverId: targetUser.id,
        status: friendship.status,
        createdAt: friendship.createdAt,
        sender: {
          id: req.user.id,
          username: req.user.username
        }
      });

      // Gönderen kullanıcıya da bildirim gönder
      sendWebSocketMessage(clients.get(req.user.id), 'FRIEND_REQUEST_SENT', {
        ...friendship,
        sender: {
          id: req.user.id,
          username: req.user.username
        }
      });

      res.status(201).json(friendship);
    } catch (error: any) {
      console.error('Add friend error:', error);
      res.status(400).json({ message: error.message || "Failed to send friend request" });
    }
  });

  app.post("/api/channels/:channelId/signal", ensureAuthenticated, async (req: Request, res: Response) => {
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

  app.get("/api/servers", ensureAuthenticated, async (req: Request, res: Response) => {
    if (!req.user) return res.sendStatus(401);
    try {
      const servers = await storage.getServers(req.user.id);
      res.json(servers);
    } catch (error) {
      console.error('Get servers error:', handleError(error));
      res.status(500).json({ message: "Failed to get servers" });
    }
  });

  app.get("/api/servers/:serverId", ensureAuthenticated, ensureServerMember, async (req: Request, res: Response) => {
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

  app.post("/api/servers", ensureAuthenticated, async (req: Request, res: Response) => {
    if (!req.user) return res.sendStatus(401);
    try {
      console.log('Creating server:', req.body);
      const server = await storage.createServer(req.body.name, req.user.id);

      // Kullanıcıya adminlik yetkisi ver
      await storage.addServerMember(server.id, req.user.id, true);

      console.log('Server created:', server);
      res.status(201).json(server);
    } catch (error) {
      console.error('Create server error:', handleError(error));
      res.status(500).json({ message: "Failed to create server" });
    }
  });

  app.get("/api/servers/:serverId/channels", ensureAuthenticated, ensureServerMember, async (req: Request, res: Response) => {
    if (!req.user) return res.sendStatus(401);
    try {
      console.log('Fetching channels for server:', req.params.serverId);
      const channels = await storage.getChannels(parseInt(req.params.serverId));
      if (!channels) return res.sendStatus(404);
      console.log('Channels found:', channels);
      res.json(channels);
    } catch (error) {
      console.error('Get channels error:', handleError(error));
      res.status(500).json({ message: "Failed to get channels" });
    }
  });

  app.post("/api/servers/:serverId/channels", ensureAuthenticated, ensureServerAdmin, async (req: Request, res: Response) => {
    try {
      console.log('Creating channel:', req.body);
      const server = await storage.getServer(parseInt(req.params.serverId));
      if (!server) {
        return res.status(404).json({ message: "Server not found" });
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
  app.delete("/api/channels/:channelId", ensureAuthenticated, ensureServerAdmin, async (req: Request, res: Response) => {
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

  app.delete("/api/servers/:serverId", ensureAuthenticated, ensureServerOwner, async (req: Request, res: Response) => {
    if (!req.user) return res.sendStatus(401);

    try {
      const server = await storage.getServer(parseInt(req.params.serverId));
      if (!server) return res.sendStatus(404);

      if (server.ownerId !== req.user.id) {
        return res.sendStatus(403);
      }

      await storage.deleteServer(parseInt(req.params.serverId), req.user.id);
      res.sendStatus(200);
    } catch (error) {
      console.error('Delete server error:', handleError(error));
      res.status(400).json({ error: handleError(error) });
    }
  });

  // Davet oluşturma endpoint'i
  app.post("/api/invites", ensureAuthenticated, ensureServerAdmin, async (req: Request, res: Response) => {
    if (!req.user) return res.sendStatus(401);

    try {
      const { serverId, receiverId } = req.body;
      const server = await storage.getServer(serverId);

      if (!server) {
        return res.status(404).json({ message: "Server not found" });
      }

      console.log("Creating invite for server:", serverId, "receiver:", receiverId);

      const invite = await storage.createInvite(serverId, req.user.id, receiverId);
      res.status(201).json(invite);
    } catch (error) {
      console.error('Create invite error:', handleError(error));
      res.status(500).json({ message: "Failed to create invite" });
    }
  });

  return httpServer;
}