import { users, servers, channels, serverMembers, friendships, serverInvites } from "@shared/schema";
import type { InsertUser, User, Server, Channel, ServerMember, Friendship, ServerInvite, Message, Reaction, MessageWithReactions } from "@shared/schema";
import session from "express-session";
import createMemoryStore from "memorystore";
import { nanoid } from "nanoid";
import { userCoins, coinTransactions, coinProducts, userAchievements } from "@shared/schema";
import type { UserCoins, CoinTransaction, CoinProduct, UserAchievement } from "@shared/schema";

const MemoryStore = createMemoryStore(session);

interface Gift {
  id: number;
  name: string;
  description: string;
  price: number;
  icon: string;
  experiencePoints: number;
  createdAt: Date;
}

interface GiftHistory {
  id: number;
  senderId: number;
  receiverId: number;
  giftId: number;
  coinAmount: number;
  message: string | null;
  createdAt: Date;
}

interface UserLevel {
  id: number;
  userId: number;
  level: number;
  currentExperience: number;
  nextLevelExperience: number;
  title: string;
  createdAt: Date;
}

interface UserSubscription {
  id: number;
  userId: number;
  type: string;
  startDate: Date;
  endDate: Date | null;
  features: {
    privateChannels: boolean;
    customEmojis: boolean;
    voiceEffects: boolean;
    extendedUpload: boolean;
  };
  createdAt: Date;
}


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

  createServerInvite(serverId: number, inviterId: number, inviteeId: number): Promise<ServerInvite>;
  getServerInvite(code: string): Promise<ServerInvite | undefined>;
  getServerInvitesByUser(userId: number): Promise<ServerInvite[]>;
  joinServerWithInvite(code: string, userId: number): Promise<void>;
  acceptServerInvite(inviteId: number): Promise<void>;
  rejectServerInvite(inviteId: number): Promise<void>;

  getChannels(serverId: number): Promise<Channel[]>;
  createChannel(name: string, serverId: number, isVoice: boolean, isPrivate?: boolean): Promise<Channel>;

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

  // Gift related methods
  getGifts(): Promise<Gift[]>;
  sendGift(senderId: number, receiverId: number, giftId: number, message?: string): Promise<GiftHistory>;
  getGiftHistory(userId: number): Promise<GiftHistory[]>;

  // Level related methods
  getUserLevel(userId: number): Promise<UserLevel>;
  addExperience(userId: number, amount: number): Promise<UserLevel>;
  calculateTitle(level: number): string;

  // Premium üyelik metodları
  getUserSubscription(userId: number): Promise<UserSubscription | undefined>;
  createUserSubscription(userId: number): Promise<UserSubscription>;
  hasActiveSubscription(userId: number): Promise<boolean>;

  // Gizli kanal metodları
  addUserToPrivateChannel(channelId: number, userId: number): Promise<void>;
  removeUserFromPrivateChannel(channelId: number, userId: number): Promise<void>;
  canAccessChannel(channelId: number, userId: number): Promise<boolean>;

  // Media related methods
  setChannelMedia(channelId: number, media: {
    type: "music" | "video";
    url: string;
    title: string;
    queuedBy: number;
  }): Promise<Channel>;

  addToMediaQueue(channelId: number, media: {
    type: "music" | "video";
    url: string;
    title: string;
    queuedBy: number;
  }): Promise<Channel>;

  skipCurrentMedia(channelId: number): Promise<Channel>;
  clearMediaQueue(channelId: number): Promise<void>;
  deleteChannel(channelId: number): Promise<void>;

  // Friend related methods
  getFriendship(userId1: number, userId2: number): Promise<Friendship | undefined>;
  addFriend(userId1: number, userId2: number): Promise<void>;
  removeFriend(userId1: number, userId2: number): Promise<void>;
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
  private gifts: Map<number, Gift>;
  private userLevels: Map<number, UserLevel>;
  private giftHistory: Map<number, GiftHistory>;
  private userSubscriptions: Map<number, UserSubscription>;

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
    this.gifts = new Map();
    this.userLevels = new Map();
    this.giftHistory = new Map();
    this.userSubscriptions = new Map();

    this.initializeCoinProducts();
    this.initializeGifts();
  }

  private initializeCoinProducts() {
    const products = [
      {
        id: this.currentId++,
        name: "Başlangıç Paketi",
        description: "Yeni başlayanlar için ideal - 100 Ozba Coin",
        amount: 100,
        price: 29.99,
        bonus: 0,
        isPopular: false,
        createdAt: new Date(),
      },
      {
        id: this.currentId++,
        name: "Popüler Paket",
        description: "En çok tercih edilen - 500 Ozba Coin + 50 Bonus Coin",
        amount: 500,
        price: 149.99,
        bonus: 50,
        isPopular: true,
        createdAt: new Date(),
      },
      {
        id: this.currentId++,
        name: "Premium Paket",
        description: "En iyi fiyat/performans - 1200 Ozba Coin + 200 Bonus Coin + Premium Üyelik",
        amount: 1200,
        price: 299.99,
        bonus: 200,
        isPopular: false,
        createdAt: new Date(),
      },
    ];

    products.forEach(product => this.coinProducts.set(product.id, product));
  }

  private initializeGifts() {
    const gifts = [
      {
        id: this.currentId++,
        name: "Çiçek",
        description: "Güzel bir çiçek buketi",
        price: 50,
        icon: "🌸",
        experiencePoints: 10,
        createdAt: new Date(),
      },
      {
        id: this.currentId++,
        name: "Kalp",
        description: "Sevgi dolu bir kalp",
        price: 100,
        icon: "❤️",
        experiencePoints: 20,
        createdAt: new Date(),
      },
      {
        id: this.currentId++,
        name: "Yıldız",
        description: "Parlak bir yıldız",
        price: 200,
        icon: "⭐",
        experiencePoints: 40,
        createdAt: new Date(),
      },
      {
        id: this.currentId++,
        name: "Taç",
        description: "Gösterişli bir taç",
        price: 500,
        icon: "👑",
        experiencePoints: 100,
        createdAt: new Date(),
      },
    ];

    gifts.forEach(gift => this.gifts.set(gift.id, gift));
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
      status: "online",
      nickname: insertUser.username,
      bio: null,
      age: null,
      socialLinks: null,
      theme: "system",
      isPrivateProfile: false,
      showLastSeen: true,
      lastActive: new Date(),
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

  async createServerInvite(serverId: number, inviterId: number, inviteeId: number): Promise<ServerInvite> {
    const id = this.currentId++;
    const invite: ServerInvite = {
      id,
      serverId,
      inviterId,
      inviteeId,
      status: 'pending',
      code: nanoid(10),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
      createdAt: new Date(),
    };
    this.serverInvites.set(invite.code, invite);
    return invite;
  }

  async getServerInvite(code: string): Promise<ServerInvite | undefined> {
    const invite = this.serverInvites.get(code);
    return invite && (!invite.expiresAt || invite.expiresAt > new Date()) ? invite : undefined;
  }

  async getServerInvitesByUser(userId: number): Promise<ServerInvite[]> {
    return Array.from(this.serverInvites.values())
      .filter(invite => invite.inviteeId === userId && invite.status === 'pending');
  }

  async joinServerWithInvite(code: string, userId: number): Promise<void> {
    const invite = await this.getServerInvite(code);
    if (invite) {
      await this.addServerMember(invite.serverId, userId);
      this.serverInvites.delete(code);
    }
  }

  async acceptServerInvite(inviteId: number): Promise<void> {
    const invite = Array.from(this.serverInvites.values())
      .find(inv => inv.id === inviteId);

    if (invite && invite.status === 'pending') {
      invite.status = 'accepted';
      await this.addServerMember(invite.serverId, invite.inviteeId);
      this.serverInvites.set(invite.code, invite);
    }
  }

  async rejectServerInvite(inviteId: number): Promise<void> {
    const invite = Array.from(this.serverInvites.values())
      .find(inv => inv.id === inviteId);

    if (invite && invite.status === 'pending') {
      invite.status = 'rejected';
      this.serverInvites.set(invite.code, invite);
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

  async createChannel(name: string, serverId: number, isVoice: boolean, isPrivate: boolean = false): Promise<Channel> {
    const id = this.currentId++;
    const channel: Channel = {
      id,
      name,
      serverId,
      isVoice,
      isPrivate,
      allowedUsers: [],
      createdAt: new Date(),
      currentMedia: null,
      mediaQueue: []
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

  async getGifts(): Promise<Gift[]> {
    return Array.from(this.gifts.values());
  }

  async sendGift(senderId: number, receiverId: number, giftId: number, message?: string): Promise<GiftHistory> {
    const gift = this.gifts.get(giftId);
    if (!gift) {
      throw new Error("Gift not found");
    }

    const senderCoins = await this.getUserCoins(senderId);
    if (!senderCoins || senderCoins.balance < gift.price) {
      throw new Error("Insufficient coins");
    }

    // Deduct coins from sender
    await this.addCoins(
      senderId,
      -gift.price,
      'gift_sent',
      `Sent gift: ${gift.name}`,
      { giftId, receiverId }
    );

    // Add experience to receiver
    await this.addExperience(receiverId, gift.experiencePoints);

    // Record gift history
    const giftHistory: GiftHistory = {
      id: this.currentId++,
      senderId,
      receiverId,
      giftId,
      coinAmount: gift.price,
      message: message || null,
      createdAt: new Date(),
    };

    this.giftHistory.set(giftHistory.id, giftHistory);
    return giftHistory;
  }

  async getGiftHistory(userId: number): Promise<GiftHistory[]> {
    return Array.from(this.giftHistory.values())
      .filter(gh => gh.senderId === userId || gh.receiverId === userId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async getUserLevel(userId: number): Promise<UserLevel> {
    let userLevel = Array.from(this.userLevels.values())
      .find(ul => ul.userId === userId);

    if (!userLevel) {
      userLevel = {
        id: this.currentId++,
        userId,
        level: 1,
        currentExperience: 0,
        nextLevelExperience: 100,
        title: this.calculateTitle(1),
        createdAt: new Date(),
      };
      this.userLevels.set(userLevel.id, userLevel);
    }

    return userLevel;
  }

  async addExperience(userId: number, amount: number): Promise<UserLevel> {
    const userLevel = await this.getUserLevel(userId);
    userLevel.currentExperience += amount;

    // Level up if enough experience
    while (userLevel.currentExperience >= userLevel.nextLevelExperience) {
      userLevel.currentExperience -= userLevel.nextLevelExperience;
      userLevel.level += 1;
      userLevel.nextLevelExperience = Math.floor(userLevel.nextLevelExperience * 1.5);
      userLevel.title = this.calculateTitle(userLevel.level);

      // Award coins for leveling up
      await this.addCoins(
        userId,
        userLevel.level * 50,
        'level_up',
        `Level up reward: Level ${userLevel.level}`,
        { level: userLevel.level }
      );
    }

    this.userLevels.set(userLevel.id, userLevel);
    return userLevel;
  }

  calculateTitle(level: number): string {
    const titles = {
      1: "Yeni Üye",
      5: "Aktif Üye",
      10: "Bronz Üye",
      20: "Gümüş Üye",
      30: "Altın Üye",
      50: "Elmas Üye",
      75: "Veteran Üye",
      100: "Efsane Üye"
    };

    const eligibleTitles = Object.entries(titles)
      .filter(([reqLevel]) => parseInt(reqLevel) <= level)
      .sort((a, b) => parseInt(b[0]) - parseInt(a[0]));

    return eligibleTitles[0]?.[1] || "Yeni Üye";
  }

  async getUserSubscription(userId: number): Promise<UserSubscription | undefined> {
    return Array.from(this.userSubscriptions.values()).find(
      sub => sub.userId === userId && (!sub.endDate || new Date(sub.endDate) > new Date())
    );
  }

  async createUserSubscription(userId: number): Promise<UserSubscription> {
    const id = this.currentId++;
    const subscription: UserSubscription = {
      id,
      userId,
      type: 'premium',
      startDate: new Date(),
      endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 gün
      features: {
        privateChannels: true,
        customEmojis: true,
        voiceEffects: true,
        extendedUpload: true,
            },
      createdAt: new Date(),
    };
    this.userSubscriptions.set(id, subscription);
    return subscription;
  }

  async hasActiveSubscription(userId: number): Promise<boolean> {
    const subscription = await this.getUserSubscription(userId);
    return !!subscription;
  }

  async addUserToPrivateChannel(channelId: number, userId: number): Promise<void> {
    const channel = await this.getChannel(channelId);
    if (channel && channel.isPrivate) {
      channel.allowedUsers = [...(channel.allowedUsers || []), userId];
      this.channels.set(channelId, channel);
    }
  }

  async removeUserFromPrivateChannel(channelId: number, userId: number): Promise<void> {
    const channel = await this.getChannel(channelId);
    if (channel && channel.isPrivate) {
      channel.allowedUsers = (channel.allowedUsers || []).filter(id => id !== userId);
      this.channels.set(channelId, channel);
    }
  }

  async canAccessChannel(channelId: number, userId: number): Promise<boolean> {
    const channel = await this.getChannel(channelId);
    if (!channel) return false;
    if (!channel.isPrivate) return true;

    const server = await this.getServer(channel.serverId);
    if (server?.ownerId === userId) return true;

    return channel.allowedUsers?.includes(userId) || false;
  }

  async setChannelMedia(channelId: number, media: {
    type: "music" | "video";
    url: string;
    title: string;
    queuedBy: number;
  }): Promise<Channel> {
    const channel = await this.getChannel(channelId);
    if (!channel) throw new Error("Channel not found");

    channel.currentMedia = {
      ...media,
      startedAt: new Date()
    };

    this.channels.set(channelId, channel);
    return channel;
  }

  async addToMediaQueue(channelId: number, media: {
    type: "music" | "video";
    url: string;
    title: string;
    queuedBy: number;
  }): Promise<Channel> {
    const channel =await this.getChannel(channelId);
    if (!channel) throw new Error("Channel not found");

    channel.mediaQueue = [...(channel.mediaQueue || []), media];
    this.channels.set(channelId, channel);
    return channel;
  }

  async skipCurrentMedia(channelId: number): Promise<Channel> {
    const channel = await this.getChannel(channelId);
    if (!channel) throw new Error("Channel not found");

    if (channel.mediaQueue && channel.mediaQueue.length > 0) {
      const [nextMedia, ...remainingQueue] = channel.mediaQueue;
      channel.currentMedia = {
        ...nextMedia,
        startedAt: new Date()
      };
      channel.mediaQueue = remainingQueue;
    } else {
      channel.currentMedia = null;
    }

    this.channels.set(channelId, channel);
    return channel;
  }

  async clearMediaQueue(channelId: number): Promise<void> {
    const channel = await this.getChannel(channelId);
    if (!channel) throw new Error("Channel not found");

    channel.mediaQueue = [];
    this.channels.set(channelId, channel);
  }
  async deleteChannel(channelId: number): Promise<void> {
    this.channels.delete(channelId);

    // Kanala ait mesajları temizle
    const messageIds = Array.from(this.messages.entries())
      .filter(([_, message]) => message.channelId === channelId)
      .map(([id]) => id);

    messageIds.forEach(id => this.messages.delete(id));

    // Kanala ait reaksiyonları temizle
    const reactionIds = Array.from(this.reactions.entries())
      .filter(([_, reaction]) => messageIds.includes(reaction.messageId))
      .map(([id]) => id);

    reactionIds.forEach(id => this.reactions.delete(id));
  }
  async getFriendship(userId1: number, userId2: number): Promise<Friendship | undefined> {
    return Array.from(this.friendships.values()).find(
      f => (f.senderId === userId1 && f.receiverId === userId2) ||
           (f.senderId === userId2 && f.receiverId === userId1)
    );
  }

  async addFriend(userId1: number, userId2: number): Promise<void> {
    const id = this.currentId++;
    const friendship: Friendship = {
      id,
      senderId: userId1,
      receiverId: userId2,
      status: 'accepted',
      createdAt: new Date(),
    };
    this.friendships.set(id, friendship);
  }

  async removeFriend(userId1: number, userId2: number): Promise<void> {
    const friendship = await this.getFriendship(userId1, userId2);
    if (friendship) {
      this.friendships.delete(friendship.id);
    }
  }
}

export const storage = new MemStorage();