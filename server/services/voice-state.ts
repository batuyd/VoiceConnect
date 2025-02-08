import { MongoClient, Collection, MongoClientOptions } from 'mongodb';
import { Redis } from 'ioredis';

interface VoiceState {
  userId: number;
  channelId: number;
  serverId: number;
  isMuted: boolean;
  isDeafened: boolean;
  timestamp: number;
  connectionQuality: number;
  deviceInfo: {
    name: string;
    type: string;
  };
}

interface VoiceConnection {
  peerId: string;
  userId: number;
  channelId: number;
  iceServers: RTCIceServer[];
  connectionType: 'p2p' | 'relay';
  quality: {
    jitter: number;
    packetsLost: number;
    roundTripTime: number;
  };
}

class VoiceStateManager {
  private voiceStates!: Collection<VoiceState>;
  private voiceConnections!: Collection<VoiceConnection>;
  private redis: Redis;
  private mongoClient: MongoClient;
  private isConnected: boolean = false;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 10;
  private healthCheckInterval?: NodeJS.Timeout;

  constructor() {
    const mongoOptions: MongoClientOptions = {
      ssl: true,
      tls: true,
      tlsAllowInvalidCertificates: true,
      retryWrites: true,
      connectTimeoutMS: 10000,
      serverSelectionTimeoutMS: 10000,
      maxPoolSize: 50,
      minPoolSize: 10,
      maxIdleTimeMS: 30000,
      socketTimeoutMS: 360000,
      family: 4
    };

    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017';
    console.log('Connecting to MongoDB with URI:', mongoUri.replace(/:[^:]*@/, ':****@'));
    this.mongoClient = new MongoClient(mongoUri, mongoOptions);

    const redisOptions = {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      password: process.env.REDIS_PASSWORD,
      maxRetriesPerRequest: 3,
      retryStrategy: (times: number) => {
        if (times > this.maxReconnectAttempts) {
          console.error('Max Redis reconnection attempts reached');
          return null;
        }
        const delay = Math.min(1000 * Math.pow(2, times), 30000);
        console.log(`Retrying Redis connection in ${delay}ms...`);
        return delay;
      },
      reconnectOnError: (err: Error) => {
        const targetError = 'READONLY';
        if (err.message.includes(targetError)) {
          return true;
        }
        return false;
      },
      enableReadyCheck: true,
      connectTimeout: 10000,
      keepAlive: 30000,
      family: 4,
      db: 0
    };

    console.log('Connecting to Redis at:', process.env.REDIS_HOST || 'localhost');
    this.redis = new Redis(redisOptions);

    this.redis.on('connect', () => {
      console.log('Redis connected successfully');
      this.isConnected = true;
      this.reconnectAttempts = 0;
    });

    this.redis.on('error', (error) => {
      console.error('Redis connection error:', error);
      this.isConnected = false;
    });

    this.redis.on('close', () => {
      console.log('Redis connection closed');
      this.isConnected = false;
    });

    this.initialize().catch(error => {
      console.error('Failed to initialize voice state manager:', error);
    });
    this.startHealthCheck();
  }

  private async initialize() {
    try {
      console.log('Initializing MongoDB connection...');
      await this.mongoClient.connect();
      console.log('MongoDB connected successfully');

      const db = this.mongoClient.db('voice_chat');
      this.voiceStates = db.collection<VoiceState>('voice_states');
      this.voiceConnections = db.collection<VoiceConnection>('voice_connections');

      try {
        await Promise.all([
          this.voiceStates.createIndex({ userId: 1 }),
          this.voiceStates.createIndex({ channelId: 1 }),
          this.voiceConnections.createIndex({ userId: 1 }),
          this.voiceConnections.createIndex({ channelId: 1 })
        ]);
        console.log('MongoDB indexes created successfully');
      } catch (indexError) {
        console.warn('Index creation warning:', indexError);
      }

      console.log('Voice state manager initialized successfully');
    } catch (error) {
      console.error('Failed to initialize voice state manager:', error);
      throw error;
    }
  }

  private startHealthCheck() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    this.healthCheckInterval = setInterval(async () => {
      try {
        if (!this.isConnected) {
          await this.reconnect();
        }

        await this.redis.ping();
        await this.mongoClient.db().admin().ping();

      } catch (error) {
        console.error('Health check failed:', error);
        this.isConnected = false;
      }
    }, 30000); 
  }

  private async reconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnection attempts reached');
      return;
    }

    this.reconnectAttempts++;
    console.log(`Reconnection attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);

    try {
      await this.initialize();
      this.isConnected = true;
      this.reconnectAttempts = 0;
      console.log('Reconnected successfully');
    } catch (error) {
      console.error('Reconnection failed:', error);
    }
  }

  async updateVoiceState(state: VoiceState): Promise<void> {
    try {
      if (!this.isConnected) {
        await this.reconnect();
      }

      await this.voiceStates.updateOne(
        { userId: state.userId },
        { $set: { ...state, timestamp: Date.now() } },
        { upsert: true }
      );

      const channelKey = `voice:channel:${state.channelId}`;
      let retries = 0;
      while (retries < 3) {
        try {
          await this.redis.multi()
            .hset(channelKey, state.userId.toString(), JSON.stringify(state))
            .expire(channelKey, 3600)
            .exec();
          break;
        } catch (error) {
          retries++;
          if (retries === 3) throw error;
          await new Promise(resolve => setTimeout(resolve, 1000 * retries));
        }
      }
    } catch (error) {
      console.error('Failed to update voice state:', error);
      throw error;
    }
  }

  async getChannelVoiceStates(channelId: number): Promise<VoiceState[]> {
    try {
      if (!this.isConnected) {
        await this.reconnect();
      }

      let retries = 0;
      while (retries < 3) {
        try {
          const channelKey = `voice:channel:${channelId}`;
          const cachedStates = await this.redis.hgetall(channelKey);

          if (Object.keys(cachedStates).length > 0) {
            return Object.values(cachedStates).map(state => JSON.parse(state));
          }
          break;
        } catch (error) {
          retries++;
          if (retries === 3) break;
          await new Promise(resolve => setTimeout(resolve, 1000 * retries));
        }
      }

      const states = await this.voiceStates
        .find({ channelId })
        .sort({ timestamp: -1 })
        .toArray();

      const channelKey = `voice:channel:${channelId}`;
      const multi = this.redis.multi();
      states.forEach(state => {
        multi.hset(channelKey, state.userId.toString(), JSON.stringify(state));
      });
      multi.expire(channelKey, 3600);

      try {
        await multi.exec();
      } catch (error) {
        console.warn('Redis caching failed:', error);
      }

      return states;
    } catch (error) {
      console.error('Failed to get channel voice states:', error);
      throw error;
    }
  }

  async addVoiceConnection(connection: VoiceConnection): Promise<void> {
    try {
      await this.voiceConnections.insertOne(connection);

      const connectionKey = `voice:connection:${connection.userId}`;
      await this.redis.set(connectionKey, JSON.stringify(connection), 'EX', 3600);
    } catch (error) {
      console.error('Failed to add voice connection:', error);
      throw error;
    }
  }

  async removeVoiceConnection(userId: number): Promise<void> {
    try {
      await this.voiceConnections.deleteOne({ userId });
      await this.redis.del(`voice:connection:${userId}`);
    } catch (error) {
      console.error('Failed to remove voice connection:', error);
      throw error;
    }
  }

  async getActiveConnections(channelId: number): Promise<VoiceConnection[]> {
    try {
      return await this.voiceConnections
        .find({ channelId })
        .toArray();
    } catch (error) {
      console.error('Failed to get active connections:', error);
      throw error;
    }
  }

  async cleanup(): Promise<void> {
    try {
      if (this.healthCheckInterval) {
        clearInterval(this.healthCheckInterval);
      }
      await Promise.all([
        this.mongoClient.close(),
        this.redis.quit()
      ]);
    } catch (error) {
      console.error('Failed to cleanup voice state manager:', error);
      throw error;
    }
  }
}

export const voiceStateManager = new VoiceStateManager();