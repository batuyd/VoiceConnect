import { pgTable, text, serial, integer, boolean, timestamp, jsonb, decimal } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  nickname: text("nickname"),
  password: text("password").notNull(),
  avatar: text("avatar").notNull(),
  email: text("email").notNull().unique(),
  phone: text("phone").notNull().unique(),
  bio: text("bio"),
  status: text("status"),
  age: integer("age"),
  lastActive: timestamp("last_active"),
  socialLinks: jsonb("social_links").$type<{
    discord?: string;
    twitter?: string;
    instagram?: string;
    website?: string;
  }>(),
  theme: text("theme").default("system"),
  isPrivateProfile: boolean("is_private_profile").default(false),
  showLastSeen: boolean("show_last_seen").default(true),
  twoFactorEnabled: boolean("two_factor_enabled").notNull().default(false),
  twoFactorSecret: text("two_factor_secret"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const friendships = pgTable("friendships", {
  id: serial("id").primaryKey(),
  senderId: integer("sender_id").notNull(),
  receiverId: integer("receiver_id").notNull(),
  status: text("status").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const servers = pgTable("servers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  ownerId: integer("owner_id").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const serverInvites = pgTable("server_invites", {
  id: serial("id").primaryKey(),
  serverId: integer("server_id").notNull(),
  inviterId: integer("inviter_id").notNull(),
  code: text("code").notNull().unique(),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const channels = pgTable("channels", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  serverId: integer("server_id").notNull(),
  isVoice: boolean("is_voice").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const serverMembers = pgTable("server_members", {
  id: serial("id").primaryKey(),
  serverId: integer("server_id").notNull(),
  userId: integer("user_id").notNull(),
  joinedAt: timestamp("joined_at").notNull().defaultNow(),
});

export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  content: text("content").notNull(),
  channelId: integer("channel_id").notNull(),
  userId: integer("user_id").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const reactions = pgTable("reactions", {
  id: serial("id").primaryKey(),
  emoji: text("emoji").notNull(),
  messageId: integer("message_id").notNull(),
  userId: integer("user_id").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const userCoins = pgTable("user_coins", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  balance: decimal("balance").notNull().default("0"),
  lifetimeEarned: decimal("lifetime_earned").notNull().default("0"),
  lastDailyReward: timestamp("last_daily_reward"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const coinTransactions = pgTable("coin_transactions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  amount: decimal("amount").notNull(),
  type: text("type").notNull(), // 'daily_reward', 'purchase', 'achievement', 'voice_activity', 'referral'
  description: text("description").notNull(),
  metadata: jsonb("metadata").$type<{
    orderId?: string;
    productId?: number;
    achievementId?: number;
    referrerId?: number;
    voiceMinutes?: number;
  }>(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const coinProducts = pgTable("coin_products", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  amount: decimal("amount").notNull(),
  price: decimal("price").notNull(), // In USD
  bonus: decimal("bonus").default("0"),
  isPopular: boolean("is_popular").default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const userAchievements = pgTable("user_achievements", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  type: text("type").notNull(), // 'voice_time', 'referrals', 'reactions', 'messages'
  progress: integer("progress").notNull().default(0),
  goal: integer("goal").notNull(),
  rewardAmount: decimal("reward_amount").notNull(),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const gifts = pgTable("gifts", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  price: decimal("price").notNull(),
  icon: text("icon").notNull(),
  experiencePoints: integer("experience_points").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const userLevels = pgTable("user_levels", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  level: integer("level").notNull().default(1),
  currentExperience: integer("current_experience").notNull().default(0),
  nextLevelExperience: integer("next_level_experience").notNull().default(100),
  title: text("title").notNull().default("Yeni Üye"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const giftHistory = pgTable("gift_history", {
  id: serial("id").primaryKey(),
  senderId: integer("sender_id").notNull(),
  receiverId: integer("receiver_id").notNull(),
  giftId: integer("gift_id").notNull(),
  coinAmount: decimal("coin_amount").notNull(),
  message: text("message"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

const baseUserSchema = createInsertSchema(users);

export const insertUserSchema = baseUserSchema.extend({
  username: z.string()
    .min(3, "Kullanıcı adı en az 3 karakter olmalıdır")
    .max(20, "Kullanıcı adı en fazla 20 karakter olabilir")
    .regex(/^[a-zA-Z0-9_]+$/, "Kullanıcı adı sadece harf, rakam ve alt çizgi içerebilir"),
  nickname: z.string().max(30, "Takma ad en fazla 30 karakter olabilir").optional(),
  password: z.string().min(8, "Şifre en az 8 karakter olmalıdır"),
  email: z.string().email("Geçersiz email adresi").optional(),
  phone: z.string().optional(),
  avatar: z.string().optional(),
  bio: z.string().max(500, "Biyografi en fazla 500 karakter olabilir").optional(),
  status: z.string().max(100, "Durum mesajı en fazla 100 karakter olabilir").optional(),
  age: z.number().optional(),
  socialLinks: z.object({
    discord: z.string().optional(),
    twitter: z.string().optional(),
    instagram: z.string().optional(),
    website: z.string().optional(),
  }).optional(),
  theme: z.enum(["light", "dark", "system"]).optional(),
  isPrivateProfile: z.boolean().optional(),
  showLastSeen: z.boolean().optional(),
});

export const insertServerSchema = createInsertSchema(servers);
export const insertChannelSchema = createInsertSchema(channels);
export const insertServerMemberSchema = createInsertSchema(serverMembers);
export const insertFriendshipSchema = createInsertSchema(friendships);
export const insertServerInviteSchema = createInsertSchema(serverInvites);
export const insertMessageSchema = createInsertSchema(messages);
export const insertReactionSchema = createInsertSchema(reactions);
export const insertUserCoinsSchema = createInsertSchema(userCoins);
export const insertCoinTransactionSchema = createInsertSchema(coinTransactions);
export const insertCoinProductSchema = createInsertSchema(coinProducts);
export const insertUserAchievementSchema = createInsertSchema(userAchievements);
export const insertGiftSchema = createInsertSchema(gifts);
export const insertUserLevelSchema = createInsertSchema(userLevels);
export const insertGiftHistorySchema = createInsertSchema(giftHistory);

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type Server = typeof servers.$inferSelect;
export type Channel = typeof channels.$inferSelect;
export type ServerMember = typeof serverMembers.$inferSelect;
export type Friendship = typeof friendships.$inferSelect;
export type ServerInvite = typeof serverInvites.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type Reaction = typeof reactions.$inferSelect;
export type UserCoins = typeof userCoins.$inferSelect;
export type CoinTransaction = typeof coinTransactions.$inferSelect;
export type CoinProduct = typeof coinProducts.$inferSelect;
export type UserAchievement = typeof userAchievements.$inferSelect;
export type Gift = typeof gifts.$inferSelect;
export type UserLevel = typeof userLevels.$inferSelect;
export type GiftHistory = typeof giftHistory.$inferSelect;

export type MessageWithReactions = Message & {
  user: User;
  reactions: (Reaction & { user: User })[];
};

export type UserWithLevel = User & {
  level: UserLevel;
};