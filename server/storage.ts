import { users, servers, channels, serverMembers, friendships, serverInvites } from "@shared/schema";
import type { InsertUser, User, Server, Channel, ServerMember, Friendship, ServerInvite } from "@shared/schema";
import session from "express-session";
import createMemoryStore from "memorystore";
import { nanoid } from "nanoid";

const MemoryStore = createMemoryStore(session);

export interface IStorage {
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByPhone(phone: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUserTwoFactor(userId: number, enabled: boolean, secret?: string): Promise<void>;

  getFriends(userId: number): Promise<User[]>;
  getFriendRequests(userId: number): Promise<Friendship[]>;
  createFriendRequest(senderId: number, receiverId: number): Promise<Friendship>;
  acceptFriendRequest(friendshipId: number): Promise<void>;
  rejectFriendRequest(friendshipId: number): Promise<void>;

  getServers(userId: number): Promise<Server[]>;
  createServer(name: string, ownerId: number): Promise<Server>;

  createServerInvite(serverId: number, inviterId: number): Promise<ServerInvite>;
  getServerInvite(code: string): Promise<ServerInvite | undefined>;
  joinServerWithInvite(code: string, userId: number): Promise<void>;

  getChannels(serverId: number): Promise<Channel[]>;
  createChannel(name: string, serverId: number, isVoice: boolean): Promise<Channel>;

  getServerMembers(serverId: number): Promise<User[]>;
  addServerMember(serverId: number, userId: number): Promise<void>;

  sessionStore: session.Store;
}

export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private servers: Map<number, Server>;
  private channels: Map<number, Channel>;
  private serverMembers: Map<number, ServerMember>;
  private friendships: Map<number, Friendship>;
  private serverInvites: Map<string, ServerInvite>; // Changed to string key for code
  sessionStore: session.Store;
  currentId: number;

  constructor() {
    this.users = new Map();
    this.servers = new Map();
    this.channels = new Map();
    this.serverMembers = new Map();
    this.friendships = new Map();
    this.serverInvites = new Map();
    this.currentId = 1;
    this.sessionStore = new MemoryStore({
      checkPeriod: 86400000,
    });
  }

  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.email === email,
    );
  }

  async getUserByPhone(phone: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.phone === phone,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = this.currentId++;
    const defaultAvatars = [
      "https://images.unsplash.com/photo-1630910561339-4e22c7150093",
      "https://images.unsplash.com/photo-1438761681033-6461ffad8d80",
      "https://images.unsplash.com/photo-1646617747609-45b466ace9a6",
      "https://images.unsplash.com/photo-1628891435222-065925dcb365",
      "https://images.unsplash.com/photo-1507499036636-f716246c2c23",
      "https://images.unsplash.com/photo-1601388352547-2802c6f32eb8"
    ];

    const user: User = {
      ...insertUser,
      id,
      avatar: defaultAvatars[Math.floor(Math.random() * defaultAvatars.length)],
      twoFactorEnabled: false,
      twoFactorSecret: null,
      createdAt: new Date(),
    };
    this.users.set(id, user);
    return user;
  }

  async updateUserTwoFactor(userId: number, enabled: boolean, secret?: string): Promise<void> {
    const user = await this.getUser(userId);
    if (user) {
      user.twoFactorEnabled = enabled;
      user.twoFactorSecret = secret || null;
      this.users.set(userId, user);
    }
  }

  async getFriends(userId: number): Promise<User[]> {
    const friendships = Array.from(this.friendships.values()).filter(
      f => (f.senderId === userId || f.receiverId === userId) && f.status === 'accepted'
    );
    const friendIds = friendships.map(f => f.senderId === userId ? f.receiverId : f.senderId);
    return friendIds
      .map(id => this.users.get(id))
      .filter((user): user is User => user !== undefined);
  }

  async getFriendRequests(userId: number): Promise<Friendship[]> {
    return Array.from(this.friendships.values()).filter(
      f => f.receiverId === userId && f.status === 'pending'
    );
  }

  async createFriendRequest(senderId: number, receiverId: number): Promise<Friendship> {
    const id = this.currentId++;
    const friendship: Friendship = {
      id,
      senderId,
      receiverId,
      status: 'pending',
      createdAt: new Date(),
    };
    this.friendships.set(id, friendship);
    return friendship;
  }

  async acceptFriendRequest(friendshipId: number): Promise<void> {
    const friendship = this.friendships.get(friendshipId);
    if (friendship && friendship.status === 'pending') {
      friendship.status = 'accepted';
      this.friendships.set(friendshipId, friendship);
    }
  }

  async rejectFriendRequest(friendshipId: number): Promise<void> {
    const friendship = this.friendships.get(friendshipId);
    if (friendship && friendship.status === 'pending') {
      friendship.status = 'rejected';
      this.friendships.set(friendshipId, friendship);
    }
  }

  async createServerInvite(serverId: number, inviterId: number): Promise<ServerInvite> {
    const id = this.currentId++;
    const invite: ServerInvite = {
      id,
      serverId,
      inviterId,
      code: nanoid(10),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 saat geçerli
      createdAt: new Date(),
    };
    this.serverInvites.set(invite.code, invite); // Use code as key
    return invite;
  }

  async getServerInvite(code: string): Promise<ServerInvite | undefined> {
    const invite = this.serverInvites.get(code);
    return invite && (!invite.expiresAt || invite.expiresAt > new Date()) ? invite : undefined;
  }

  async joinServerWithInvite(code: string, userId: number): Promise<void> {
    const invite = await this.getServerInvite(code);
    if (invite) {
      await this.addServerMember(invite.serverId, userId);
      this.serverInvites.delete(code); // Delete invite after use
    }
  }

  async getServers(userId: number): Promise<Server[]> {
    const memberServers = Array.from(this.serverMembers.values())
      .filter(member => member.userId === userId)
      .map(member => this.servers.get(member.serverId))
      .filter((server): server is Server => server !== undefined);
    return memberServers;
  }

  async createServer(name: string, ownerId: number): Promise<Server> {
    const id = this.currentId++;
    const server: Server = { 
      id, 
      name, 
      ownerId,
      createdAt: new Date(),
    };
    this.servers.set(id, server);
    await this.addServerMember(id, ownerId);
    return server;
  }

  async getChannels(serverId: number): Promise<Channel[]> {
    return Array.from(this.channels.values()).filter(
      channel => channel.serverId === serverId
    );
  }

  async createChannel(name: string, serverId: number, isVoice: boolean): Promise<Channel> {
    const id = this.currentId++;
    const channel: Channel = { 
      id, 
      name, 
      serverId, 
      isVoice,
      createdAt: new Date(),
    };
    this.channels.set(id, channel);
    return channel;
  }

  async getServerMembers(serverId: number): Promise<User[]> {
    const memberIds = Array.from(this.serverMembers.values())
      .filter(member => member.serverId === serverId)
      .map(member => member.userId);

    return memberIds
      .map(id => this.users.get(id))
      .filter((user): user is User => user !== undefined);
  }

  async addServerMember(serverId: number, userId: number): Promise<void> {
    const id = this.currentId++;
    this.serverMembers.set(id, { 
      id, 
      serverId, 
      userId,
      joinedAt: new Date(),
    });
  }
}

export const storage = new MemStorage();