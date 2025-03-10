import { relations } from "drizzle-orm";
import { pgTable, text, serial, integer, boolean, timestamp, jsonb, decimal } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  nickname: text("nickname"),
  password: text("password").notNull(),
  avatar: text("avatar").notNull().default("https://api.dicebear.com/7.x/initials/svg"),
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
  senderId: integer("sender_id").notNull().references(() => users.id),
  receiverId: integer("receiver_id").notNull().references(() => users.id),
  status: text("status").notNull().default('pending'),
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
  inviteeId: integer("invitee_id").notNull(),
  status: text("status").notNull().default('pending'),
  code: text("code").notNull().unique(),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const channels = pgTable("channels", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  serverId: integer("server_id").notNull(),
  isVoice: boolean("is_voice").notNull().default(false),
  isPrivate: boolean("is_private").notNull().default(false),
  allowedUsers: integer("allowed_users").array(),
  type: text("type").default("text"),
  currentMedia: jsonb("current_media").$type<{
    type: "music" | "video";
    url: string;
    title: string;
    startedAt: Date;
    queuedBy: number;
  }>(),
  mediaQueue: jsonb("media_queue").$type<{
    type: "music" | "video";
    url: string;
    title: string;
    queuedBy: number;
  }[]>(),
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
  type: text("type").notNull(),
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
  price: decimal("price").notNull(),
  bonus: decimal("bonus").default("0"),
  isPopular: boolean("is_popular").default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const userAchievements = pgTable("user_achievements", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  type: text("type").notNull(),
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

export const userSubscriptions = pgTable("user_subscriptions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  type: text("type").notNull(),
  startDate: timestamp("start_date").notNull(),
  endDate: timestamp("end_date"),
  features: jsonb("features").$type<{
    privateChannels: boolean;
    customEmojis: boolean;
    voiceEffects: boolean;
    extendedUpload: boolean;
  }>(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Define relations
export const friendshipsRelations = relations(friendships, ({ one }) => ({
  sender: one(users, {
    fields: [friendships.senderId],
    references: [users.id],
  }),
  receiver: one(users, {
    fields: [friendships.receiverId],
    references: [users.id],
  }),
}));

export const usersRelations = relations(users, ({ many }) => ({
  sentFriendRequests: many(friendships, { relationName: "sender" }),
  receivedFriendRequests: many(friendships, { relationName: "receiver" }),
}));


const baseUserSchema = createInsertSchema(users);

export const insertUserSchema = baseUserSchema.extend({
  username: z.string()
    .min(3, "Kullanıcı adı en az 3 karakter olmalıdır")
    .max(20, "Kullanıcı adı en fazla 20 karakter olabilir")
    .regex(/^[a-zA-Z0-9_]+$/, "Kullanıcı adı sadece harf, rakam ve alt çizgi içerebilir"),
  password: z.string()
    .min(8, "Şifre en az 8 karakter olmalıdır")
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, "Şifre en az bir büyük harf, bir küçük harf ve bir rakam içermelidir"),
  email: z.string()
    .email("Geçersiz email adresi")
    .min(1, "Email adresi zorunludur"),
  phone: z.string()
    .regex(/^\+?[1-9]\d{1,14}$/, "Geçersiz telefon numarası")
    .min(1, "Telefon numarası gereklidir"),
  nickname: z.string().max(30, "Takma ad en fazla 30 karakter olabilir").optional(),
  avatar: z.string().url("Geçersiz URL formatı").optional(),
  bio: z.string().max(500, "Biyografi en fazla 500 karakter olabilir").optional(),
  status: z.string().max(100, "Durum mesajı en fazla 100 karakter olabilir").optional(),
  age: z.number().int("Yaş tam sayı olmalıdır").min(13, "Yaş en az 13 olmalıdır").optional(),
  socialLinks: z.object({
    discord: z.string().regex(/^.{3,32}#[0-9]{4}$/, "Geçersiz Discord kullanıcı adı").optional(),
    twitter: z.string().regex(/^[A-Za-z0-9_]{4,15}$/, "Geçersiz Twitter kullanıcı adı").optional(),
    instagram: z.string().regex(/^[a-zA-Z0-9._]{1,30}$/, "Geçersiz Instagram kullanıcı adı").optional(),
    website: z.string().url("Geçersiz website URL'si").optional(),
  }).optional(),
  theme: z.enum(["light", "dark", "system"]).optional(),
  isPrivateProfile: z.boolean().optional(),
  showLastSeen: z.boolean().optional(),
}).omit({ id: true, createdAt: true, twoFactorEnabled: true, twoFactorSecret: true });

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
export const insertUserSubscriptionSchema = createInsertSchema(userSubscriptions);

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type Server = typeof servers.$inferSelect;
export type Channel = typeof channels.$inferSelect;
export type ServerMember = typeof serverMembers.$inferSelect;
export type Friendship = typeof friendships.$inferSelect & {
  sender?: User;
  receiver?: User;
};
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
export type UserSubscription = typeof userSubscriptions.$inferSelect;

export type MessageWithReactions = Message & {
  user: User;
  reactions: (Reaction & { user: User })[];
};

export type UserWithLevel = User & {
  level: UserLevel;
};