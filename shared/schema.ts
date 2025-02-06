import { pgTable, text, serial, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  avatar: text("avatar").notNull(),
  email: text("email").notNull().unique(),
  phone: text("phone").notNull().unique(),
  bio: text("bio"),
  age: integer("age"),
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

const baseUserSchema = createInsertSchema(users);

export const insertUserSchema = baseUserSchema.extend({
  username: z.string()
    .min(3, "Kullanıcı adı en az 3 karakter olmalıdır")
    .max(20, "Kullanıcı adı en fazla 20 karakter olabilir")
    .regex(/^[a-zA-Z0-9_]+$/, "Kullanıcı adı sadece harf, rakam ve alt çizgi içerebilir"),
  password: z.string().min(8, "Şifre en az 8 karakter olmalıdır"),
  email: z.string().email("Geçersiz email adresi").optional(),
  phone: z.string().optional(),
  avatar: z.string().optional(),
  bio: z.string().optional(),
  age: z.number().optional(),
});

export const insertServerSchema = createInsertSchema(servers);
export const insertChannelSchema = createInsertSchema(channels);
export const insertServerMemberSchema = createInsertSchema(serverMembers);
export const insertFriendshipSchema = createInsertSchema(friendships);
export const insertServerInviteSchema = createInsertSchema(serverInvites);

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type Server = typeof servers.$inferSelect;
export type Channel = typeof channels.$inferSelect;
export type ServerMember = typeof serverMembers.$inferSelect;
export type Friendship = typeof friendships.$inferSelect;
export type ServerInvite = typeof serverInvites.$inferSelect;