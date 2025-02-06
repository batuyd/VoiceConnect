import { users, servers, channels, serverMembers } from "@shared/schema";
import type { InsertUser, User, Server, Channel, ServerMember } from "@shared/schema";
import session from "express-session";
import createMemoryStore from "memorystore";

const MemoryStore = createMemoryStore(session);

export interface IStorage {
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  getServers(userId: number): Promise<Server[]>;
  createServer(name: string, ownerId: number): Promise<Server>;
  
  getChannels(serverId: number): Promise<Channel[]>;
  createChannel(name: string, serverId: number, isVoice: boolean): Promise<Channel>;
  
  getServerMembers(serverId: number): Promise<User[]>;
  addServerMember(serverId: number, userId: number): Promise<void>;
  
  sessionStore: session.SessionStore;
}

export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private servers: Map<number, Server>;
  private channels: Map<number, Channel>;
  private serverMembers: Map<number, ServerMember>;
  sessionStore: session.SessionStore;
  currentId: number;

  constructor() {
    this.users = new Map();
    this.servers = new Map();
    this.channels = new Map();
    this.serverMembers = new Map();
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
      avatar: defaultAvatars[Math.floor(Math.random() * defaultAvatars.length)]
    };
    this.users.set(id, user);
    return user;
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
    const server: Server = { id, name, ownerId };
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
    const channel: Channel = { id, name, serverId, isVoice };
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
    this.serverMembers.set(id, { id, serverId, userId });
  }
}

export const storage = new MemStorage();
