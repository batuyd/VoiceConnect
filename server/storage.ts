import { users, servers, channels, serverMembers, friendships, serverInvites } from "@shared/schema";
import type { InsertUser, User, Server, Channel, ServerMember, Friendship, ServerInvite, Message, Reaction, MessageWithReactions } from "@shared/schema";
import session from "express-session";
import createMemoryStore from "memorystore";
import { nanoid } from "nanoid";
import { userCoins, coinTransactions, coinProducts, userAchievements } from "@shared/schema";
import type { UserCoins, CoinTransaction, CoinProduct, UserAchievement } from "@shared/schema";

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
  getServer(serverId: number): Promise<Server | undefined>;
  createServer(name: string, ownerId: number): Promise<Server>;

  createServerInvite(serverId: number, inviterId: number): Promise<ServerInvite>;
  getServerInvite(code: string): Promise<ServerInvite | undefined>;
  joinServerWithInvite(code: string, userId: number): Promise<void>;

  getChannels(serverId: number): Promise<Channel[]>;
  createChannel(name: string, serverId: number, isVoice: boolean): Promise<Channel>;

  getServerMembers(serverId: number): Promise<User[]>;
  addServerMember(serverId: number, userId: number): Promise<void>;
  getChannel(channelId: number): Promise<Channel | undefined>;

  sessionStore: session.Store;
  updateUserProfile(
    userId: number,
    data: {
      bio?: string;
      age?: number;
      avatar?: string;
      nickname?: string;
      status?: string;
      socialLinks?: {
        discord?: string;
        twitter?: string;
        instagram?: string;
        website?: string;
      };
      theme?: string;
      isPrivateProfile?: boolean;
      showLastSeen?: boolean;
    }
  ): Promise<User>;
  updateLastActive(userId: number): Promise<void>;
  createMessage(channelId: number, userId: number, content: string): Promise<Message>;
  getMessages(channelId: number): Promise<MessageWithReactions[]>;
  addReaction(messageId: number, userId: number, emoji: string): Promise<Reaction>;
  removeReaction(messageId: number, userId: number, emoji: string): Promise<void>;

  // Coin related methods
  getUserCoins(userId: number): Promise<UserCoins | undefined>;
  createUserCoins(userId: number): Promise<UserCoins>;
  addCoins(userId: number, amount: number, type: string, description: string, metadata?: any): Promise<CoinTransaction>;
  getCoinProducts(): Promise<CoinProduct[]>;
  getUserAchievements(userId: number): Promise<UserAchievement[]>;
  updateUserAchievement(userId: number, type: string, progress: number): Promise<UserAchievement>;
  claimDailyReward(userId: number): Promise<CoinTransaction>;
}

export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private servers: Map<number, Server>;
  private channels: Map<number, Channel>;
  private serverMembers: Map<number, ServerMember>;
  private friendships: Map<number, Friendship>;
  private serverInvites: Map<string, ServerInvite>;
  private messages: Map<number, Message>;
  private reactions: Map<number, Reaction>;
  sessionStore: session.Store;
  currentId: number;
  private userCoins: Map<number, UserCoins>;
  private coinTransactions: Map<number, CoinTransaction>;
  private coinProducts: Map<number, CoinProduct>;
  private userAchievements: Map<number, UserAchievement>;

  constructor() {
    this.users = new Map();
    this.servers = new Map();
    this.channels = new Map();
    this.serverMembers = new Map();
    this.friendships = new Map();
    this.serverInvites = new Map();
    this.messages = new Map();
    this.reactions = new Map();
    this.currentId = 1;
    this.sessionStore = new MemoryStore({
      checkPeriod: 86400000,
    });
    this.userCoins = new Map();
    this.coinTransactions = new Map();
    this.coinProducts = new Map();
    this.userAchievements = new Map();

    this.initializeCoinProducts();
  }

  private initializeCoinProducts() {
    const products = [
      {
        id: this.currentId++,
        name: "Starter Pack",
        description: "Perfect for beginners",
        amount: 100,
        price: 0.99,
        bonus: 0,
        isPopular: false,
        createdAt: new Date(),
      },
      {
        id: this.currentId++,
        name: "Popular Pack",
        description: "Most popular choice",
        amount: 500,
        price: 4.99,
        bonus: 50,
        isPopular: true,
        createdAt: new Date(),
      },
      {
        id: this.currentId++,
        name: "Premium Pack",
        description: "Best value for money",
        amount: 1200,
        price: 9.99,
        bonus: 200,
        isPopular: false,
        createdAt: new Date(),
      },
    ];

    products.forEach(product => this.coinProducts.set(product.id, product));
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
      id,
      username: insertUser.username,
      password: insertUser.password,
      email: insertUser.email || `user${id}@placeholder.com`,
      phone: insertUser.phone || `+${Math.floor(Math.random() * 100000000000)}`,
      avatar: insertUser.avatar || defaultAvatars[Math.floor(Math.random() * defaultAvatars.length)],
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
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      createdAt: new Date(),
    };
    this.serverInvites.set(invite.code, invite);
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
      this.serverInvites.delete(code);
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

  async getServer(serverId: number): Promise<Server | undefined> {
    return this.servers.get(serverId);
  }
  async getChannel(channelId: number): Promise<Channel | undefined> {
    return this.channels.get(channelId);
  }
  async updateUserProfile(
    userId: number,
    data: {
      bio?: string;
      age?: number;
      avatar?: string;
      nickname?: string;
      status?: string;
      socialLinks?: {
        discord?: string;
        twitter?: string;
        instagram?: string;
        website?: string;
      };
      theme?: string;
      isPrivateProfile?: boolean;
      showLastSeen?: boolean;
    }
  ): Promise<User> {
    const user = await this.getUser(userId);
    if (!user) {
      throw new Error("User not found");
    }

    const updatedUser = {
      ...user,
      bio: data.bio ?? user.bio,
      age: data.age ?? user.age,
      avatar: data.avatar ?? user.avatar,
      nickname: data.nickname ?? user.nickname,
      status: data.status ?? user.status,
      socialLinks: data.socialLinks ?? user.socialLinks,
      theme: data.theme ?? user.theme,
      isPrivateProfile: data.isPrivateProfile ?? user.isPrivateProfile,
      showLastSeen: data.showLastSeen ?? user.showLastSeen,
      lastActive: new Date(),
    };

    this.users.set(userId, updatedUser);
    return updatedUser;
  }

  async updateLastActive(userId: number): Promise<void> {
    const user = await this.getUser(userId);
    if (user) {
      user.lastActive = new Date();
      this.users.set(userId, user);
    }
  }
  async createMessage(channelId: number, userId: number, content: string): Promise<Message> {
    const id = this.currentId++;
    const message: Message = {
      id,
      content,
      channelId,
      userId,
      createdAt: new Date(),
    };
    this.messages.set(id, message);
    return message;
  }

  async getMessages(channelId: number): Promise<MessageWithReactions[]> {
    const messages = Array.from(this.messages.values())
      .filter(message => message.channelId === channelId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

    return Promise.all(
      messages.map(async message => {
        const user = await this.getUser(message.userId);
        const reactions = Array.from(this.reactions.values())
          .filter(reaction => reaction.messageId === message.id);

        const reactionsWithUsers = await Promise.all(
          reactions.map(async reaction => ({
            ...reaction,
            user: (await this.getUser(reaction.userId))!
          }))
        );

        return {
          ...message,
          user: user!,
          reactions: reactionsWithUsers
        };
      })
    );
  }

  async addReaction(messageId: number, userId: number, emoji: string): Promise<Reaction> {
    const id = this.currentId++;
    const reaction: Reaction = {
      id,
      emoji,
      messageId,
      userId,
      createdAt: new Date(),
    };
    this.reactions.set(id, reaction);
    return reaction;
  }

  async removeReaction(messageId: number, userId: number, emoji: string): Promise<void> {
    const reaction = Array.from(this.reactions.values()).find(
      r => r.messageId === messageId && r.userId === userId && r.emoji === emoji
    );
    if (reaction) {
      this.reactions.delete(reaction.id);
    }
  }

  async getUserCoins(userId: number): Promise<UserCoins | undefined> {
    return Array.from(this.userCoins.values()).find(uc => uc.userId === userId);
  }

  async createUserCoins(userId: number): Promise<UserCoins> {
    const id = this.currentId++;
    const userCoins: UserCoins = {
      id,
      userId,
      balance: 0,
      lifetimeEarned: 0,
      lastDailyReward: null,
      createdAt: new Date(),
    };
    this.userCoins.set(id, userCoins);
    return userCoins;
  }

  async addCoins(
    userId: number,
    amount: number,
    type: string,
    description: string,
    metadata?: any
  ): Promise<CoinTransaction> {
    let userCoins = await this.getUserCoins(userId);
    if (!userCoins) {
      userCoins = await this.createUserCoins(userId);
    }

    userCoins.balance += amount;
    if (amount > 0) {
      userCoins.lifetimeEarned += amount;
    }
    this.userCoins.set(userCoins.id, userCoins);

    const transaction: CoinTransaction = {
      id: this.currentId++,
      userId,
      amount,
      type,
      description,
      metadata,
      createdAt: new Date(),
    };
    this.coinTransactions.set(transaction.id, transaction);

    return transaction;
  }

  async getCoinProducts(): Promise<CoinProduct[]> {
    return Array.from(this.coinProducts.values());
  }

  async getUserAchievements(userId: number): Promise<UserAchievement[]> {
    return Array.from(this.userAchievements.values())
      .filter(ua => ua.userId === userId);
  }

  async updateUserAchievement(
    userId: number,
    type: string,
    progress: number
  ): Promise<UserAchievement> {
    let achievement = Array.from(this.userAchievements.values())
      .find(ua => ua.userId === userId && ua.type === type);

    if (!achievement) {
      achievement = {
        id: this.currentId++,
        userId,
        type,
        progress: 0,
        goal: this.getAchievementGoal(type),
        rewardAmount: this.getAchievementReward(type),
        completedAt: null,
        createdAt: new Date(),
      };
    }

    achievement.progress = progress;
    if (progress >= achievement.goal && !achievement.completedAt) {
      achievement.completedAt = new Date();
      await this.addCoins(
        userId,
        achievement.rewardAmount,
        'achievement',
        `Completed achievement: ${type}`,
        { achievementId: achievement.id }
      );
    }

    this.userAchievements.set(achievement.id, achievement);
    return achievement;
  }

  private getAchievementGoal(type: string): number {
    const goals: Record<string, number> = {
      voice_time: 3600, 
      referrals: 5,
      reactions: 50,
      messages: 100,
    };
    return goals[type] || 100;
  }

  private getAchievementReward(type: string): number {
    const rewards: Record<string, number> = {
      voice_time: 100,
      referrals: 500,
      reactions: 50,
      messages: 100,
    };
    return rewards[type] || 50;
  }

  async claimDailyReward(userId: number): Promise<CoinTransaction> {
    let userCoins = await this.getUserCoins(userId);
    if (!userCoins) {
      userCoins = await this.createUserCoins(userId);
    }

    const now = new Date();
    if (userCoins.lastDailyReward) {
      const lastReward = new Date(userCoins.lastDailyReward);
      if (
        lastReward.getDate() === now.getDate() &&
        lastReward.getMonth() === now.getMonth() &&
        lastReward.getFullYear() === now.getFullYear()
      ) {
        throw new Error("Daily reward already claimed today");
      }
    }

    userCoins.lastDailyReward = now;
    this.userCoins.set(userCoins.id, userCoins);

    return this.addCoins(
      userId,
      50, 
      'daily_reward',
      'Daily login reward',
      { claimedAt: now }
    );
  }
}

export const storage = new MemStorage();