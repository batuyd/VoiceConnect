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

  // WebSocket server configuration
  const wss = new WebSocketServer({
    server: httpServer,
    path: '/ws'
  });

  // Set up session middleware for WebSocket
  const sessionParser = session({
    secret: process.env.REPL_ID!,
    resave: false,
    saveUninitialized: false,
    store: storage.sessionStore,
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
  });

  app.use(sessionParser);

  // WebSocket connection handling
  wss.on('connection', async (ws, req) => {
    try {
      await new Promise((resolve) => {
        sessionParser(req as any, {} as any, resolve);
      });

      const sessionData = (req as any).session;
      if (!sessionData?.passport?.user) {
        ws.close();
        return;
      }

      const userId = sessionData.passport.user;
      const user = await storage.getUser(userId);

      if (!user) {
        ws.close();
        return;
      }

      ws.on('message', async (message) => {
        try {
          const data = JSON.parse(message.toString());

          if (data.type === 'join_channel') {
            const channel = await storage.getChannel(data.channelId);
            if (!channel) {
              ws.close();
              return;
            }

            const canAccess = await storage.canAccessChannel(data.channelId, userId);
            if (!canAccess) {
              ws.close();
              return;
            }

            // Broadcast member update
            wss.clients.forEach((client) => {
              if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({
                  type: 'member_update',
                  channelId: data.channelId,
                  userId: userId,
                  username: user.username,
                  action: 'join'
                }));
              }
            });
          }
        } catch (error) {
          ws.close();
        }
      });

      ws.on('close', () => {
        // Handle disconnection silently
      });

    } catch (error) {
      ws.close();
    }
  });

  // Media server configuration
  const mediaServerConfig = {
    rtmp: {
      port: parseInt(process.env.RTMP_PORT || '1935'),
      chunk_size: 60000,
      gop_cache: true,
      ping: 30,
      ping_timeout: 60,
      host: '0.0.0.0'
    },
    http: {
      port: parseInt(process.env.MEDIA_HTTP_PORT || '8000'),
      host: '0.0.0.0',
      mediaroot: './media',
      allow_origin: '*'
    }
  };

  const nms = new NodeMediaServer(mediaServerConfig);

  try {
    nms.run();
  } catch (error) {
    // Ignore media server errors
  }

  return httpServer;
}