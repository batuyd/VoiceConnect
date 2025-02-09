import { db } from "./db";
import { eq, and, or } from "drizzle-orm";
import { users, friendships, servers, channels, serverMembers, serverInvites, userCoins, coinTransactions, coinProducts, userAchievements, messages, reactions } from "@shared/schema";
import type { InsertUser, User, Server, Channel, ServerMember, Friendship, ServerInvite, UserCoins, CoinTransaction, CoinProduct, UserAchievement, Message, MessageWithReactions, Reaction } from "@shared/schema";
import session from "express-session";
import connectPg from "connect-pg-simple";
import { pool } from "./db";
import { nanoid } from "nanoid";
import emailTemplates from './services/emailTemplates';
import { sendEmail } from './services/email';

const PostgresSessionStore = connectPg(session);

export class DatabaseStorage implements IStorage {
  sessionStore: session.Store;

  constructor() {
    this.sessionStore = new PostgresSessionStore({
      pool,
      createTableIfMissing: true,
    });
  }

  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async getUserByPhone(phone: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.phone, phone));
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async updateUserTwoFactor(userId: number, enabled: boolean, secret?: string): Promise<void> {
    await db.update(users).set({ twoFactorEnabled: enabled, twoFactorSecret: secret || null }).where(eq(users.id, userId));
  }

  async getFriends(userId: number): Promise<User[]> {
    const friendshipResults = await db
      .select()
      .from(friendships)
      .where(
        and(
          or(
            eq(friendships.senderId, userId),
            eq(friendships.receiverId, userId)
          ),
          eq(friendships.status, 'accepted')
        )
      );

    const friendIds = friendshipResults.map(f =>
      f.senderId === userId ? f.receiverId : f.senderId
    );

    if (friendIds.length === 0) return [];

    return await db
      .select()
      .from(users)
      .where(or(...friendIds.map(id => eq(users.id, id))));
  }

  async getFriendRequests(userId: number): Promise<Friendship[]> {
    const requests = await db
      .select({
        friendship: friendships,
        sender: users,
      })
      .from(friendships)
      .innerJoin(users, eq(users.id, friendships.senderId))
      .where(
        and(
          eq(friendships.receiverId, userId),
          eq(friendships.status, 'pending')
        )
      );

    return requests.map(({ friendship, sender }) => ({
      ...friendship,
      sender,
    }));
  }

  async getPendingFriendRequests(userId: number): Promise<Friendship[]> {
    console.log(`Getting pending friend requests for user ${userId}`);

    // Use proper join and select statements
    const requests = await db
      .select({
        id: friendships.id,
        senderId: friendships.senderId,
        receiverId: friendships.receiverId,
        status: friendships.status,
        createdAt: friendships.createdAt,
        sender: users,
      })
      .from(friendships)
      .innerJoin(users, eq(users.id, friendships.senderId))
      .where(
        and(
          eq(friendships.receiverId, userId),
          eq(friendships.status, 'pending')
        )
      );

    console.log("Found requests:", requests);

    // Map the results to match the Friendship type
    return requests.map(({ sender, ...friendship }) => ({
      ...friendship,
      sender,
    }));
  }

  async createFriendRequest(senderId: number, receiverId: number): Promise<Friendship> {
    console.log(`Creating friend request from ${senderId} to ${receiverId}`);

    // Check if friendship already exists with any status
    const existingFriendship = await this.getFriendship(senderId, receiverId);

    if (existingFriendship) {
      if (existingFriendship.status === 'accepted') {
        throw new Error("Already friends with this user");
      } else if (existingFriendship.status === 'pending') {
        throw new Error("Friend request already exists");
      }
    }

    // If no friendship exists, create a new one
    const [friendship] = await db
      .insert(friendships)
      .values({
        senderId,
        receiverId,
        status: 'pending',
        createdAt: new Date()
      })
      .returning();

    console.log("Created friendship:", friendship);

    // Get sender information
    const [sender] = await db
      .select()
      .from(users)
      .where(eq(users.id, senderId));

    return {
      ...friendship,
      sender
    };
  }

  async acceptFriendRequest(friendshipId: number): Promise<void> {
    console.log(`Accepting friend request: ${friendshipId}`);

    try {
      const [friendship] = await db
        .update(friendships)
        .set({ status: 'accepted' })
        .where(eq(friendships.id, friendshipId))
        .returning();

      if (!friendship) {
        throw new Error('Friendship request not found');
      }

      console.log('Friend request accepted:', friendship);
    } catch (error) {
      console.error('Error accepting friend request:', error);
      throw error;
    }
  }

  async rejectFriendRequest(friendshipId: number): Promise<void> {
    await db
      .update(friendships)
      .set({ status: 'rejected' })
      .where(eq(friendships.id, friendshipId));
  }

  async getServers(userId: number): Promise<Server[]> {
    try {
      // First get all server memberships for the user
      const memberships = await db
        .select()
        .from(serverMembers)
        .where(eq(serverMembers.userId, userId));

      if (memberships.length === 0) {
        return [];
      }

      // Then get all servers for those memberships
      const serverIds = memberships.map(member => member.serverId);
      const userServers = await db
        .select()
        .from(servers)
        .where(
          or(...serverIds.map(id => eq(servers.id, id)))
        );

      return userServers;
    } catch (error) {
      console.error('Error getting servers:', error);
      return [];
    }
  }

  async getServer(serverId: number): Promise<Server | undefined> {
    const [server] = await db.select().from(servers).where(eq(servers.id, serverId));
    return server;
  }

  async createServer(name: string, ownerId: number): Promise<Server> {
    try {
      // Start a transaction to ensure both server creation and member addition succeed
      const server = await db.transaction(async (tx) => {
        // Create the server first
        const [newServer] = await tx
          .insert(servers)
          .values({ name, ownerId })
          .returning();

        // Add the owner as a server member
        await tx
          .insert(serverMembers)
          .values({ serverId: newServer.id, userId: ownerId });

        return newServer;
      });

      console.log('Server created successfully:', server);
      return server;
    } catch (error) {
      console.error('Error creating server:', error);
      throw new Error('Failed to create server');
    }
  }

  async createServerInvite(serverId: number, inviterId: number, inviteeId: number): Promise<ServerInvite> {
    const invite: ServerInvite = {
      id: 0, //Will be auto-incremented by database
      serverId,
      inviterId,
      inviteeId,
      status: 'pending',
      code: nanoid(10),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      createdAt: new Date(),
    };
    const [insertedInvite] = await db.insert(serverInvites).values(invite).returning();
    return insertedInvite;
  }

  async getServerInvite(code: string): Promise<ServerInvite | undefined> {
    const [invite] = await db.select().from(serverInvites).where(eq(serverInvites.code, code));
    return invite && (!invite.expiresAt || invite.expiresAt > new Date()) ? invite : undefined;
  }

  async getServerInvitesByUser(userId: number): Promise<ServerInvite[]> {
    return db.select().from(serverInvites).where(and(eq(serverInvites.inviteeId, userId), eq(serverInvites.status, 'pending')));
  }

  async joinServerWithInvite(code: string, userId: number): Promise<void> {
    const [invite] = await db.select().from(serverInvites).where(eq(serverInvites.code, code));
    if (invite) {
      await this.addServerMember(invite.serverId, userId);
      await db.delete(serverInvites).where(eq(serverInvites.code, code));
    }
  }

  async acceptServerInvite(inviteId: number): Promise<void> {
    const [invite] = await db.select().from(serverInvites).where(eq(serverInvites.id, inviteId));
    if (invite && invite.status === 'pending') {
      await db.update(serverInvites).set({ status: 'accepted' }).where(eq(serverInvites.id, inviteId));
      await this.addServerMember(invite.serverId, invite.inviteeId);
    }
  }

  async rejectServerInvite(inviteId: number): Promise<void> {
    await db.update(serverInvites).set({ status: 'rejected' }).where(eq(serverInvites.id, inviteId));
  }

  async getChannels(serverId: number): Promise<Channel[]> {
    return db.select().from(channels).where(eq(channels.serverId, serverId));
  }

  async createChannel(name: string, serverId: number, isVoice: boolean, isPrivate: boolean = false): Promise<Channel> {
    const channel = {
      name,
      serverId,
      isVoice,
      isPrivate,
      type: "text",
      allowedUsers: [],
      currentMedia: null,
      mediaQueue: [],
      createdAt: new Date(),
    };

    try {
      const [insertedChannel] = await db.insert(channels).values(channel).returning();
      console.log('Created channel:', insertedChannel);
      return insertedChannel;
    } catch (error) {
      console.error('Create channel error:', error);
      throw new Error('Failed to create channel');
    }
  }

  async getServerMembers(serverId: number): Promise<User[]> {
    const userIds = (await db.select({ userId: serverMembers.userId }).from(serverMembers).where(eq(serverMembers.serverId, serverId))).map(item => item.userId);
    return db.select().from(users).where(or(...userIds.map(id => eq(users.id, id))));
  }

  async addServerMember(serverId: number, userId: number): Promise<void> {
    await db.insert(serverMembers).values({ serverId, userId });
  }

  async getChannel(channelId: number): Promise<Channel | undefined> {
    const [channel] = await db.select().from(channels).where(eq(channels.id, channelId));
    return channel;
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
    const updatedUser = { ...data, lastActive: new Date() };
    await db.update(users).set(updatedUser).where(eq(users.id, userId));
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    return user;
  }

  async updateLastActive(userId: number): Promise<void> {
    await db.update(users).set({ lastActive: new Date() }).where(eq(users.id, userId));
  }
  async createMessage(channelId: number, userId: number, content: string): Promise<Message> {
    console.log('Creating message in storage:', { channelId, userId, content });

    const message = {
      channelId,
      userId,
      content,
      createdAt: new Date(),
    };

    try {
      const [insertedMessage] = await db
        .insert(messages)
        .values(message)
        .returning();

      console.log('Message created in storage:', insertedMessage);
      return insertedMessage;
    } catch (error) {
      console.error('Error creating message:', error);
      throw error;
    }
  }
  async getMessages(channelId: number): Promise<MessageWithReactions[]> {
    console.log('Getting messages for channel:', channelId);

    // Önce mesajları alalım
    const messagesResult = await db
      .select()
      .from(messages)
      .where(eq(messages.channelId, channelId))
      .orderBy(messages.createdAt);

    console.log('Found messages:', messagesResult.length);

    // Her mesaj için kullanıcı ve reaksiyonları getirelim
    const messagesWithDetails = await Promise.all(
      messagesResult.map(async (message) => {
        // Mesajın sahibi olan kullanıcıyı getir
        const [user] = await db
          .select()
          .from(users)
          .where(eq(users.id, message.userId));

        // Mesaja ait tüm reaksiyonları getir
        const messageReactions = await db
          .select()
          .from(reactions)
          .where(eq(reactions.messageId, message.id));

        console.log(`Message ${message.id} has ${messageReactions.length} reactions`);

        // Her reaksiyon için kullanıcı bilgisini getir
        const reactionsWithUsers = await Promise.all(
          messageReactions.map(async (reaction) => {
            const [reactionUser] = await db
              .select()
              .from(users)
              .where(eq(users.id, reaction.userId));

            return {
              ...reaction,
              user: reactionUser!
            };
          })
        );

        return {
          ...message,
          user: user!,
          reactions: reactionsWithUsers
        };
      })
    );

    console.log('Processed messages with reactions:', messagesWithDetails.length);
    return messagesWithDetails;
  }

  async addReaction(messageId: number, userId: number, emoji: string): Promise<Reaction> {
    // Önce aynı emoji için reaksiyon var mı kontrol edelim
    const [existingReaction] = await db
      .select()
      .from(reactions)
      .where(
        and(
          eq(reactions.messageId, messageId),
          eq(reactions.userId, userId),
          eq(reactions.emoji, emoji)
        )
      );

    if (existingReaction) {
      return existingReaction;
    }

    const reaction: Reaction = {
      id: 0, // Auto-incremented by database
      emoji,
      messageId,
      userId,
      createdAt: new Date(),
    };

    const [insertedReaction] = await db
      .insert(reactions)
      .values(reaction)
      .returning();

    return insertedReaction;
  }

  async removeReaction(messageId: number, userId: number, emoji: string): Promise<void> {
    await db.delete(reactions).where(and(eq(reactions.messageId, messageId), eq(reactions.userId, userId), eq(reactions.emoji, emoji)));
  }



  async getUserCoins(userId: number): Promise<UserCoins | undefined> {
    const [result] = await db
      .select()
      .from(userCoins)
      .where(eq(userCoins.userId, userId));
    return result;
  }

  async createUserCoins(userId: number): Promise<UserCoins> {
    const [result] = await db
      .insert(userCoins)
      .values({
        userId,
        balance: "0",
        lifetimeEarned: "0",
        lastDailyReward: null,
      })
      .returning();
    return result;
  }

  async addCoins(
    userId: number,
    amount: number,
    type: string,
    description: string,
    metadata?: any
  ): Promise<CoinTransaction> {
    let coins = await this.getUserCoins(userId);
    if (!coins) {
      coins = await this.createUserCoins(userId);
    }

    // Convert number to string for decimal columns
    const amountStr = amount.toString();

    const newBalance = (parseFloat(coins.balance) + amount).toString();
    const newLifetimeEarned = amount > 0
      ? (parseFloat(coins.lifetimeEarned) + amount).toString()
      : coins.lifetimeEarned;

    await db
      .update(userCoins)
      .set({
        balance: newBalance,
        lifetimeEarned: newLifetimeEarned,
      })
      .where(eq(userCoins.id, coins.id));

    const [transaction] = await db
      .insert(coinTransactions)
      .values({
        userId,
        amount: amountStr,
        type,
        description,
        metadata,
      })
      .returning();

    return transaction;
  }

  async getCoinProducts(): Promise<CoinProduct[]> {
    return db.select().from(coinProducts);
  }

  async getUserAchievements(userId: number): Promise<UserAchievement[]> {
    return db.select().from(userAchievements).where(eq(userAchievements.userId, userId));
  }

  async updateUserAchievement(
    userId: number,
    type: string,
    progress: number
  ): Promise<UserAchievement> {
    let [achievement] = await db.select().from(userAchievements).where(and(eq(userAchievements.userId, userId), eq(userAchievements.type, type)));

    if (!achievement) {
      achievement = {
        id: 0, //Auto-incremented by database
        userId,
        type,
        progress,
        goal: this.getAchievementGoal(type),
        rewardAmount: this.getAchievementReward(type).toString(),
        completedAt: null,
        createdAt: new Date(),
      };
      const [insertedAchievement] = await db.insert(userAchievements).values(achievement).returning();
      achievement = insertedAchievement;
    }

    if (achievement) {
      achievement.progress = progress;
      if (progress >= achievement.goal && !achievement.completedAt) {
        achievement.completedAt = new Date();
        await this.addCoins(
          userId,
          parseInt(achievement.rewardAmount),
          'achievement',
          `Completed achievement: ${type}`,
          { achievementId: achievement.id }
        );
      }

      await db.update(userAchievements).set(achievement).where(eq(userAchievements.id, achievement.id));
    }

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
    let [userCoins] = await db.select().from(userCoins).where(eq(userCoins.userId, userId));
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
    await db.update(userCoins).set(userCoins).where(eq(userCoins.id, userCoins.id));

    return this.addCoins(
      userId,
      50,
      'daily_reward',
      'Daily login reward',
      { claimedAt: now }
    );
  }

  // Gift related methods (These methods will need to be implemented using the database)
  async getGifts(): Promise<Gift[]> {
    throw new Error("Method not implemented.");
  }
  async sendGift(senderId: number, receiverId: number, giftId: number, message?: string): Promise<GiftHistory> {
    throw new Error("Method not implemented.");
  }
  async getGiftHistory(userId: number): Promise<GiftHistory[]> {
    throw new Error("Method not implemented.");
  }

  // Level related methods (These methods will need to be implemented using the database)
  async getUserLevel(userId: number): Promise<UserLevel> {
    throw new Error("Method not implemented.");
  }
  async addExperience(userId: number, amount: number): Promise<UserLevel> {
    throw new Error("Method not implemented.");
  }
  calculateTitle(level: number): string {
    throw new Error("Method not implemented.");
  }

  // Premium üyelik metodları (These methods will need to be implemented using the database)
  async getUserSubscription(userId: number): Promise<UserSubscription | undefined> {
    throw new Error("Method not implemented.");
  }
  async createUserSubscription(userId: number): Promise<UserSubscription> {
    throw new Error("Method not implemented.");
  }
  async hasActiveSubscription(userId: number): Promise<boolean> {
    throw new Error("Method not implemented.");
  }

  // Gizli kanal metodları (These methods will need to be implemented using the database)
  async addUserToPrivateChannel(channelId: number, userId: number): Promise<void> {
    throw new Error("Method not implemented.");
  }
  async removeUserFromPrivateChannel(channelId: number, userId: number): Promise<void> {
    throw new Error("Method not implemented.");
  }

  async canAccessChannel(channelId: number, userId: number): Promise<boolean> {
    try {
      // Kanalı getir
      const channel = await this.getChannel(channelId);
      if (!channel) {
        console.log(`Channel ${channelId} not found`);
        return false;
      }

      // Sunucu üyeliğini kontrol et
      const members = await this.getServerMembers(channel.serverId);
      const isMember = members.some(member => member.id === userId);

      if (!isMember) {
        console.log(`User ${userId} is not a member of server ${channel.serverId}`);
        return false;
      }

      // Eğer kanal public ise ve kullanıcı sunucu üyesi ise erişim izni ver
      if (!channel.isPrivate) {
        return true;
      }

      // Private kanal için özel izinleri kontrol et
      return channel.allowedUsers.includes(userId);
    } catch (error) {
      console.error('Error checking channel access:', error);
      return false;
    }
  }

  // Media related methods (These methods will need to be implemented using the database)
  async setChannelMedia(channelId: number, media: {
    type: "music" | "video";
    url: string;
    title: string;
    queuedBy: number;
  }): Promise<Channel> {
    throw new Error("Method not implemented.");
  }

  async addToMediaQueue(channelId: number, media: {
    type: "music" | "video";
    url: string;
    title: string;
    queuedBy: number;
  }): Promise<Channel> {
    throw new Error("Method not implemented.");
  }

  async skipCurrentMedia(channelId: number): Promise<Channel> {
    throw new Error("Method not implemented.");
  }
  async clearMediaQueue(channelId: number): Promise<void> {
    throw new Error("Method not implemented.");
  }
  async deleteChannel(channelId: number): Promise<void> {
    try {
      // Get channel first to verify it exists
      const channel = await this.getChannel(channelId);
      if (!channel) {
        throw new Error('Channel not found');
      }

      // Use transaction to ensure all related data is deleted
      await db.transaction(async (tx) => {
        // Delete all messages and reactions in the channel
        const channelMessages = await tx
          .select()
          .from(messages)
          .where(eq(messages.channelId, channelId));

        if (channelMessages.length > 0) {
          // Delete reactions for all messages in this channel
          await tx
            .delete(reactions)
            .where(
              or(...channelMessages.map(msg => eq(reactions.messageId, msg.id)))
            );
        }

        // Delete all messages
        await tx
          .delete(messages)
          .where(eq(messages.channelId, channelId));

        // Finally delete the channel itself
        await tx
          .delete(channels)
          .where(eq(channels.id, channelId));
      });

      console.log(`Channel ${channelId} successfully deleted`);
    } catch (error) {
      console.error('Error deleting channel:', error);
      throw error;
    }
  }

  // Friend related methods (These methods will need to be implemented using the database)
  async getFriendship(userId1: number, userId2: number): Promise<Friendship | undefined> {
    console.log(`Checking friendship between users ${userId1} and ${userId2}`);

    const [friendship] = await db
      .select({
        id: friendships.id,
        senderId: friendships.senderId,
        receiverId: friendships.receiverId,
        status: friendships.status,
        createdAt: friendships.createdAt,
        sender: users
      })
      .from(friendships)
      .innerJoin(users, eq(users.id, friendships.senderId))
      .where(
        and(
          or(
            and(
              eq(friendships.senderId, userId1),
              eq(friendships.receiverId, userId2)
            ),
            and(
              eq(friendships.senderId, userId2),
              eq(friendships.receiverId, userId1)
            )
          ),
          or(
            eq(friendships.status, 'accepted'),
            eq(friendships.status, 'pending')
          )
        )
      );

    if (!friendship) {
      console.log('No active friendship found');
      return undefined;
    }

    console.log('Found friendship:', friendship);
    const { sender, ...friendshipData } = friendship;
    return {
      ...friendshipData,
      sender
    };
  }

  async addFriend(userId1: number, userId2: number): Promise<void> {
    await db.update(friendships).set({ status: 'accepted' }).where(or(and(eq(friendships.senderId, userId1), eq(friendships.receiverId, userId2)), and(eq(friendships.senderId, userId2), eq(friendships.receiverId, userId1))));
  }

  async removeFriend(userId1: number, userId2: number): Promise<void> {
    try {
      console.log(`Looking for friendship between users ${userId1} and ${userId2}`);

      // Find the existing friendship with accepted status
      const [existingFriendship] = await db
        .select()
        .from(friendships)
        .where(
          and(
            or(
              and(
                eq(friendships.senderId, userId1),
                eq(friendships.receiverId, userId2)
              ),
              and(
                eq(friendships.senderId, userId2),
                eq(friendships.receiverId, userId1)
              )
            ),
            eq(friendships.status, 'accepted')
          )
        );

      if (!existingFriendship) {
        console.error(`No active friendship found between users ${userId1} and ${userId2}`);
        throw new Error('Active friendship not found');
      }

      console.log(`Found friendship to remove:`, existingFriendship);

      // Delete the friendship using a transaction
      await db.transaction(async (tx) => {
        await tx
          .delete(friendships)
          .where(eq(friendships.id, existingFriendship.id));
      });

      console.log(`Friendship between ${userId1} and ${userId2} successfully removed`);
    } catch (error) {
      console.error('Error removing friend:', error);
      throw error;
    }
  }
  async getFriendshipById(friendshipId: number): Promise<Friendship | undefined> {
    const [result] = await db
      .select({
        id: friendships.id,
        senderId: friendships.senderId,
        receiverId: friendships.receiverId,
        status: friendships.status,
        createdAt: friendships.createdAt,
        sender: users
      })
      .from(friendships)
      .innerJoin(users, eq(users.id, friendships.senderId))
      .where(eq(friendships.id, friendshipId));

    if (!result) return undefined;

    const { sender, ...friendship } = result;
    return {
      ...friendship,
      sender
    };
  }

  async deleteServer(serverId: number, userId: number): Promise<void> {
    try {
      // Get server to verify ownership
      const server = await this.getServer(serverId);
      if (!server) {
        throw new Error('Server not found');
      }

      if (server.ownerId !== userId) {
        throw new Error('Unauthorized: Only server owner can delete the server');
      }

      // Use transaction to ensure all related data is deleted
      await db.transaction(async (tx) => {
        // Get all channels first
        const serverChannels = await tx
          .select()
          .from(channels)
          .where(eq(channels.serverId, serverId));

        // Delete all messages and reactions in each channel
        for (const channel of serverChannels) {
          // Get all messages for this channel
          const channelMessages = await tx
            .select()
            .from(messages)
            .where(eq(messages.channelId, channel.id));

          // Delete reactions for all messages in this channel
          if (channelMessages.length > 0) {
            await tx
              .delete(reactions)
              .where(
                or(...channelMessages.map(msg => eq(reactions.messageId, msg.id)))
              );
          }

          // Delete all messages in this channel
          await tx
            .delete(messages)
            .where(eq(messages.channelId, channel.id));
        }

        // Delete all channels
        await tx
          .delete(channels)
          .where(eq(channels.serverId, serverId));

        // Delete all server members
        await tx
          .delete(serverMembers)
          .where(eq(serverMembers.serverId, serverId));

        // Delete all server invites
        await tx
          .delete(serverInvites)
          .where(eq(serverInvites.serverId, serverId));

        // Finally delete the server itself
        await tx
          .delete(servers)
          .where(eq(servers.id, serverId));
      });

      console.log(`Server ${serverId} successfully deleted by user ${userId}`);
    } catch (error) {
      console.error('Error deleting server:', error);
      throw error;
    }
  }
  async getFriendshipBetweenUsers(userId1: number, userId2: number): Promise<Friendship | undefined> {
    try {
      console.log(`Looking for friendship between users ${userId1} and ${userId2}`);

      const [friendship] = await db
        .select({
          id: friendships.id,
          senderId: friendships.senderId,
          receiverId: friendships.receiverId,
          status: friendships.status,
          createdAt: friendships.createdAt,
          sender: users
        })
        .from(friendships)
        .innerJoin(users, eq(users.id, friendships.senderId))
        .where(
          and(
            or(
              and(
                eq(friendships.senderId, userId1),
                eq(friendships.receiverId, userId2)
              ),
              and(
                eq(friendships.senderId,userId2),
                eq(friendships.receiverId, userId1)
              )
            ),
            eq(friendships.status, 'accepted')
          )
        );

      if (!friendship) {
        console.log('No active friendship found');
        return undefined;
      }

      console.log('Found friendship:', friendship);
      return friendship;
    } catch (error) {
      console.error('Error finding friendship:', error);
      return undefined;
    }
  }
}

export const storage = new DatabaseStorage();

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
  receiverId: number;  giftId: number;
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

interface IStorage {
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByPhone(phone: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUserTwoFactor(userId: number, enabled: boolean, secret?: string): Promise<void>;

  getFriends(userId: number): Promise<User[]>;
  getFriendRequests(userId: number): Promise<Friendship[]>;
  getPendingFriendRequests(userId: number): Promise<Friendship[]>;
  createFriendRequest(senderId: number, receiverId: number): Promise<Friendship>;
  acceptFriendRequest(friendshipId: number): Promise<void>;
  rejectFriendRequest(friendshipId: number): Promise<void>;

  getServers(userId: number): Promise<Server[]>;
  getServer(serverId: number): Promise<Server | undefined>;
  createServer(name: string, ownerId: number): Promise<Server>;

  createServerInvite(serverId: number, inviterId: number, inviteeId: number): Promise<ServerInvite>;
  getServerInvite(code: string): Promise<ServerInvite | undefined>;
  getServerInvInvitesByUser(userId: number): Promise<ServerInvite[]>;
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
  getFriendshipById(friendshipId: number): Promise<Friendship | undefined>;
  deleteServer(serverId: number, userId: number): Promise<void>;
  getFriendshipBetweenUsers(userId1: number, userId2: number): Promise<Friendship | undefined>;
}