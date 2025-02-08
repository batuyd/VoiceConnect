import { MongoClient, Collection } from 'mongodb';
import Redis from 'ioredis';

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

  constructor() {
    // MongoDB connection
    this.mongoClient = new MongoClient(process.env.MONGODB_URI || 'mongodb://localhost:27017');

    // Redis connection with options
    const redisOptions: Redis.RedisOptions = {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      }
    };

    this.redis = new Redis(redisOptions);

    // Handle Redis connection events
    this.redis.on('connect', () => {
      console.log('Redis connected successfully');
    });

    this.redis.on('error', (error) => {
      console.error('Redis connection error:', error);
    });

    this.initialize();
  }

  private async initialize() {
    try {
      await this.mongoClient.connect();
      const db = this.mongoClient.db('voice_chat');
      this.voiceStates = db.collection<VoiceState>('voice_states');
      this.voiceConnections = db.collection<VoiceConnection>('voice_connections');

      // Create indexes
      await this.voiceStates.createIndex({ userId: 1 });
      await this.voiceStates.createIndex({ channelId: 1 });
      await this.voiceConnections.createIndex({ userId: 1 });
      await this.voiceConnections.createIndex({ channelId: 1 });

      console.log('Voice state manager initialized successfully');
    } catch (error) {
      console.error('Failed to initialize voice state manager:', error);
      throw error;
    }
  }

  async updateVoiceState(state: VoiceState): Promise<void> {
    try {
      await this.voiceStates.updateOne(
        { userId: state.userId },
        { $set: { ...state, timestamp: Date.now() } },
        { upsert: true }
      );

      // Update real-time state in Redis
      const channelKey = `voice:channel:${state.channelId}`;
      await this.redis.hset(channelKey, state.userId.toString(), JSON.stringify(state));
      await this.redis.expire(channelKey, 3600); // 1 hour TTL
    } catch (error) {
      console.error('Failed to update voice state:', error);
      throw error;
    }
  }

  async getChannelVoiceStates(channelId: number): Promise<VoiceState[]> {
    try {
      // Try fast read from Redis first
      const channelKey = `voice:channel:${channelId}`;
      const cachedStates = await this.redis.hgetall(channelKey);

      if (Object.keys(cachedStates).length > 0) {
        return Object.values(cachedStates).map(state => JSON.parse(state) as VoiceState);
      }

      // Cache miss - read from MongoDB
      const states = await this.voiceStates
        .find({ channelId })
        .sort({ timestamp: -1 })
        .toArray();

      // Cache in Redis
      const multi = this.redis.multi();
      states.forEach(state => {
        multi.hset(channelKey, state.userId.toString(), JSON.stringify(state));
      });
      multi.expire(channelKey, 3600);
      await multi.exec();

      return states;
    } catch (error) {
      console.error('Failed to get channel voice states:', error);
      throw error;
    }
  }

  async addVoiceConnection(connection: VoiceConnection): Promise<void> {
    try {
      await this.voiceConnections.insertOne(connection);

      // Store connection state in Redis
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
      await this.mongoClient.close();
      await this.redis.quit();
    } catch (error) {
      console.error('Failed to cleanup voice state manager:', error);
      throw error;
    }
  }
}

export const voiceStateManager = new VoiceStateManager();