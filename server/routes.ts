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
  const httpServer = createServer(app);

  // Server management routes
  app.post("/api/servers", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Oturum açmanız gerekiyor" });
      }

      const { name } = req.body;
      if (!name) {
        return res.status(400).json({ message: "Sunucu adı gereklidir" });
      }

      const server = await storage.createServer(name, req.user.id);
      const defaultChannel = await storage.createChannel("genel", server.id, false);
      const voiceChannel = await storage.createChannel("ses-kanalı", server.id, true);

      res.status(201).json(server);
    } catch (error) {
      console.error('Sunucu oluşturma hatası:', error);
      res.status(500).json({ message: "Sunucu oluşturulurken bir hata oluştu" });
    }
  });

  app.get("/api/servers", async (req, res) => {
    try {
      if (!req.isAuthenticated()) {
        return res.status(401).json({ message: "Oturum açmanız gerekiyor" });
      }

      const servers = await storage.getServers(req.user.id);
      res.json(servers);
    } catch (error) {
      console.error('Sunucu listesi hatası:', error);
      res.status(500).json({ message: "Sunucular listelenirken bir hata oluştu" });
    }
  });

  // WebSocket server configuration
  const wss = new WebSocketServer({
    server: httpServer,
    path: '/ws'
  });

  // Session middleware for WebSocket
  const sessionSettings: session.SessionOptions = {
    secret: process.env.REPL_ID!,
    resave: true,
    saveUninitialized: true,
    store: storage.sessionStore,
    cookie: {
      secure: app.get("env") === "production",
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      httpOnly: true,
      sameSite: 'lax'
    }
  };

  const sessionParser = session(sessionSettings);

  // Express must use the same session settings
  app.use(sessionParser);

  // Track active users and connections
  const activeConnections = new Map<number, Set<WebSocket>>();
  const channelMembers = new Map<number, Set<number>>();

  wss.on('connection', async (ws, req) => {
    try {
      // Get session info
      await new Promise<void>((resolve, reject) => {
        sessionParser(req as any, {} as any, (err) => {
          if (err) {
            console.error('Session parse error:', err);
            reject(err);
          }
          resolve();
        });
      });

      const sessionData = (req as any).session;
      if (!sessionData?.passport?.user) {
        console.error('No session user found');
        ws.send(JSON.stringify({
          type: 'error',
          code: 'AUTH_REQUIRED',
          message: 'Oturum açmanız gerekiyor'
        }));
        ws.close();
        return;
      }

      const userId = sessionData.passport.user;
      const user = await storage.getUser(userId);

      if (!user) {
        console.error('User not found:', userId);
        ws.send(JSON.stringify({
          type: 'error',
          code: 'USER_NOT_FOUND',
          message: 'Kullanıcı bulunamadı'
        }));
        ws.close();
        return;
      }

      console.log('WebSocket connection established for user:', userId);

      // Ping/Pong control
      let isAlive = true;
      const pingInterval = setInterval(() => {
        if (!isAlive) {
          console.log('Client not responding, terminating connection');
          ws.terminate();
          return;
        }
        isAlive = false;
        ws.ping();
      }, 30000);

      ws.on('pong', () => {
        isAlive = true;
      });

      // Message handling
      ws.on('message', async (message) => {
        try {
          const data = JSON.parse(message.toString());
          console.log('Received message:', data.type);

          if (data.type === 'ping') {
            ws.send(JSON.stringify({ type: 'pong' }));
            return;
          }

          if (data.type === 'join_channel') {
            const channel = await storage.getChannel(data.channelId);
            if (!channel) {
              ws.send(JSON.stringify({
                type: 'error',
                code: 'CHANNEL_NOT_FOUND',
                message: 'Kanal bulunamadı'
              }));
              return;
            }

            const canAccess = await storage.canAccessChannel(data.channelId, userId);
            if (!canAccess) {
              ws.send(JSON.stringify({
                type: 'error',
                code: 'ACCESS_DENIED',
                message: 'Bu kanala erişim izniniz yok'
              }));
              return;
            }

            // Add user to channel
            if (!channelMembers.has(data.channelId)) {
              channelMembers.set(data.channelId, new Set());
            }
            channelMembers.get(data.channelId)!.add(userId);

            // Save user connection
            if (!activeConnections.has(userId)) {
              activeConnections.set(userId, new Set());
            }
            activeConnections.get(userId)!.add(ws);

            console.log('User joined channel:', data.channelId);

            // Notify channel members
            wss.clients.forEach((client) => {
              if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({
                  type: 'member_update',
                  channelId: data.channelId,
                  userId: userId,
                  username: user.username,
                  avatar: user.avatar,
                  action: 'join'
                }));
              }
            });

            // Send current members
            const members = await Promise.all(
              Array.from(channelMembers.get(data.channelId)!).map(async (memberId) => {
                const member = await storage.getUser(memberId);
                return {
                  id: member!.id,
                  username: member!.username,
                  avatar: member!.avatar
                };
              })
            );

            ws.send(JSON.stringify({
              type: 'channel_members',
              members
            }));
          }

          if (data.type === 'leave_channel') {
            if (channelMembers.has(data.channelId)) {
              channelMembers.get(data.channelId)!.delete(userId);
              console.log('User left channel:', data.channelId);

              // Notify other members
              wss.clients.forEach((client) => {
                if (client.readyState === WebSocket.OPEN) {
                  client.send(JSON.stringify({
                    type: 'member_update',
                    channelId: data.channelId,
                    userId: userId,
                    action: 'leave'
                  }));
                }
              });
            }
          }

        } catch (error) {
          console.error('Message processing error:', error);
          ws.send(JSON.stringify({
            type: 'error',
            code: 'MESSAGE_ERROR',
            message: 'Mesaj işlenirken bir hata oluştu'
          }));
        }
      });

      // Cleanup on connection close
      ws.on('close', () => {
        console.log('WebSocket connection closed for user:', userId);
        clearInterval(pingInterval);

        // Remove user from all active channels
        channelMembers.forEach((members, channelId) => {
          if (members.has(userId)) {
            members.delete(userId);

            // Notify other members
            wss.clients.forEach((client) => {
              if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({
                  type: 'member_update',
                  channelId: channelId,
                  userId: userId,
                  action: 'leave'
                }));
              }
            });
          }
        });

        // Clean up user connections
        if (activeConnections.has(userId)) {
          activeConnections.get(userId)!.delete(ws);
          if (activeConnections.get(userId)!.size === 0) {
            activeConnections.delete(userId);
          }
        }
      });

      ws.on('error', (error) => {
        console.error('WebSocket error:', error);
        clearInterval(pingInterval);
      });

    } catch (error) {
      console.error('Connection error:', error);
      ws.close();
    }
  });

  // Media server configuration
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

  nms.run();

  return httpServer;
}