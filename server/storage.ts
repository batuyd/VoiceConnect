import pkg from "pg";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";

const { Pool } = pkg;
const pgSession = connectPgSimple(session);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: false,
});

export const storage = {
  sessionStore: new pgSession({
    pool,
    tableName: "session",
  }),

  async getUserByUsername(username: string) {
    const res = await pool.query("SELECT * FROM users WHERE username = $1", [username]);
    return res.rows[0];
  },

  async getUserByEmail(email: string) {
    const res = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
    return res.rows[0];
  },

  async createUser(user: { username: string; password: string; email: string; phone: string; avatar: string }) {
    const res = await pool.query(
      "INSERT INTO users (username, password, email, phone, avatar) VALUES ($1, $2, $3, $4, $5) RETURNING *",
      [user.username, user.password, user.email, user.phone, user.avatar]
    );
    return res.rows[0];
  },

  async getUser(id: number) {
    const res = await pool.query("SELECT * FROM users WHERE id = $1", [id]);
    return res.rows[0];
  },

  async updateLastActive(userId: number) {
    await pool.query("UPDATE users SET last_active = NOW() WHERE id = $1", [userId]);
  },

  async getChannel(channelId: number) {
    const res = await pool.query("SELECT * FROM channels WHERE id = $1", [channelId]);
    return res.rows[0];
  },

  async canAccessChannel(channelId: number, userId: number) {
    const res = await pool.query(
      "SELECT * FROM channel_members WHERE channel_id = $1 AND user_id = $2",
      [channelId, userId]
    );
    return res.rowCount !== null && res.rowCount > 0;
  },

  async getPendingFriendRequests(userId: number) {
    const res = await pool.query(
      "SELECT * FROM friend_requests WHERE receiver_id = $1 AND status = 'pending'",
      [userId]
    );
    return res.rows;
  },

  async getFriendship(userId: number, targetUserId: number) {
    const res = await pool.query(
      "SELECT * FROM friendships WHERE (user_id = $1 AND friend_id = $2) OR (user_id = $2 AND friend_id = $1)",
      [userId, targetUserId]
    );
    return res.rows[0];
  },

  async createFriendRequest(userId: number, targetUserId: number) {
    const res = await pool.query(
      "INSERT INTO friend_requests (sender_id, receiver_id, status) VALUES ($1, $2, 'pending') RETURNING *",
      [userId, targetUserId]
    );
    return res.rows[0];
  },

  async getServerMembers(serverId: number) {
    const res = await pool.query(
      "SELECT * FROM server_members WHERE server_id = $1",
      [serverId]
    );
    return res.rows;
  },

  async getServers(userId: number) {
    const res = await pool.query(
      "SELECT * FROM servers WHERE owner_id = $1 OR id IN (SELECT server_id FROM server_members WHERE user_id = $1)",
      [userId]
    );
    return res.rows;
  },

  async getServer(serverId: number) {
    const res = await pool.query("SELECT * FROM servers WHERE id = $1", [serverId]);
    return res.rows[0];
  },

  async createServer(name: string, ownerId: number) {
    const res = await pool.query(
      "INSERT INTO servers (name, owner_id) VALUES ($1, $2) RETURNING *",
      [name, ownerId]
    );
    return res.rows[0];
  },

  async getChannels(serverId: number) {
    const res = await pool.query("SELECT * FROM channels WHERE server_id = $1", [serverId]);
    return res.rows;
  },

  async createChannel(name: string, serverId: number, isVoice: boolean, isPrivate: boolean) {
    const res = await pool.query(
      "INSERT INTO channels (name, server_id, is_voice, is_private) VALUES ($1, $2, $3, $4) RETURNING *",
      [name, serverId, isVoice, isPrivate]
    );
    return res.rows[0];
  },

  async deleteChannel(channelId: number) {
    await pool.query("DELETE FROM channels WHERE id = $1", [channelId]);
  },

  async updateUserProfile(userId: number, profile: { bio: string; age: number; avatar: string }) {
    const res = await pool.query(
      "UPDATE users SET bio = $1, age = $2, avatar = $3 WHERE id = $4 RETURNING *",
      [profile.bio, profile.age, profile.avatar, userId]
    );
    return res.rows[0];
  },

  async createServerInvite(serverId: number, senderId: number, receiverId: number) {
    const res = await pool.query(
      "INSERT INTO server_invites (server_id, sender_id, receiver_id) VALUES ($1, $2, $3) RETURNING *",
      [serverId, senderId, receiverId]
    );
    return res.rows[0];
  },

  async getServerInvitesByUser(userId: number) {
    const res = await pool.query(
      "SELECT * FROM server_invites WHERE receiver_id = $1",
      [userId]
    );
    return res.rows;
  },

  async acceptServerInvite(inviteId: number) {
    await pool.query(
      "UPDATE server_invites SET status = 'accepted' WHERE id = $1",
      [inviteId]
    );
  },

  async rejectServerInvite(inviteId: number) {
    await pool.query(
      "UPDATE server_invites SET status = 'rejected' WHERE id = $1",
      [inviteId]
    );
  },

  async createMessage(channelId: number, userId: number, content: string) {
    const res = await pool.query(
      "INSERT INTO messages (channel_id, user_id, content) VALUES ($1, $2, $3) RETURNING *",
      [channelId, userId, content]
    );
    return res.rows[0];
  },

  async getMessages(channelId: number) {
    const res = await pool.query("SELECT * FROM messages WHERE channel_id = $1", [channelId]);
    return res.rows;
  },

  async addReaction(messageId: number, userId: number, emoji: string) {
    const res = await pool.query(
      "INSERT INTO reactions (message_id, user_id, emoji) VALUES ($1, $2, $3) RETURNING *",
      [messageId, userId, emoji]
    );
    return res.rows[0];
  },

  async removeReaction(messageId: number, userId: number, emoji: string) {
    await pool.query(
      "DELETE FROM reactions WHERE message_id = $1 AND user_id = $2 AND emoji = $3",
      [messageId, userId, emoji]
    );
  },

  async getUserCoins(userId: number) {
    const res = await pool.query("SELECT * FROM coins WHERE user_id = $1", [userId]);
    return res.rows[0];
  },

  async createUserCoins(userId: number) {
    const res = await pool.query(
      "INSERT INTO coins (user_id, amount) VALUES ($1, 0) RETURNING *",
      [userId]
    );
    return res.rows[0];
  },

  async claimDailyReward(userId: number) {
    const res = await pool.query(
      "UPDATE coins SET amount = amount + 100 WHERE user_id = $1 RETURNING *",
      [userId]
    );
    return res.rows[0];
  },

  async getCoinProducts() {
    const res = await pool.query("SELECT * FROM coin_products");
    return res.rows;
  },

  async getUserAchievements(userId: number) {
    const res = await pool.query("SELECT * FROM achievements WHERE user_id = $1", [userId]);
    return res.rows;
  },

  async updateUserAchievement(userId: number, type: string, progress: number) {
    await pool.query(
      "UPDATE achievements SET progress = $1 WHERE user_id = $2 AND type = $3",
      [progress, userId, type]
    );
  },

  async getGifts() {
    const res = await pool.query("SELECT * FROM gifts");
    return res.rows;
  },

  async sendGift(senderId: number, receiverId: number, giftId: number, message: string) {
    const res = await pool.query(
      "INSERT INTO gift_history (sender_id, receiver_id, gift_id, message) VALUES ($1, $2, $3, $4) RETURNING *",
      [senderId, receiverId, giftId, message]
    );
    return res.rows[0];
  },

  async getGiftHistory(userId: number) {
    const res = await pool.query(
      "SELECT * FROM gift_history WHERE sender_id = $1 OR receiver_id = $1",
      [userId]
    );
    return res.rows;
  },

  async getUserLevel(userId: number) {
    const res = await pool.query("SELECT * FROM levels WHERE user_id = $1", [userId]);
    return res.rows[0];
  },

  async addUserToPrivateChannel(channelId: number, userId: number) {
    await pool.query(
      "INSERT INTO channel_members (channel_id, user_id) VALUES ($1, $2)",
      [channelId, userId]
    );
  },

  async removeUserFromPrivateChannel(channelId: number, userId: number) {
    await pool.query(
      "DELETE FROM channel_members WHERE channel_id = $1 AND user_id = $2",
      [channelId, userId]
    );
  },

  async setChannelMedia(channelId: number, media: { type: string; url: string; title: string; queuedBy: number }) {
    const res = await pool.query(
      "UPDATE channels SET current_media = $1 WHERE id = $2 RETURNING *",
      [media, channelId]
    );
    return res.rows[0];
  },

  async addToMediaQueue(channelId: number, media: { type: string; url: string; title: string; queuedBy: number }) {
    const res = await pool.query(
      "INSERT INTO media_queue (channel_id, type, url, title, queued_by) VALUES ($1, $2, $3, $4, $5) RETURNING *",
      [channelId, media.type, media.url, media.title, media.queuedBy]
    );
    return res.rows[0];
  },

  async skipCurrentMedia(channelId: number) {
    const res = await pool.query(
      "UPDATE channels SET current_media = NULL WHERE id = $1 RETURNING *",
      [channelId]
    );
    return res.rows[0];
  },

  async clearMediaQueue(channelId: number) {
    await pool.query("DELETE FROM media_queue WHERE channel_id = $1", [channelId]);
  },

  async getFriends(userId: number) {
    const res = await pool.query(
      "SELECT * FROM friendships WHERE (user_id = $1 OR friend_id = $1) AND status = 'accepted'",
      [userId]
    );
    return res.rows;
  },

  async getFriendshipById(friendshipId: number) {
    const res = await pool.query("SELECT * FROM friendships WHERE id = $1", [friendshipId]);
    return res.rows[0];
  },

  async acceptFriendRequest(friendshipId: number) {
    await pool.query(
      "UPDATE friendships SET status = 'accepted' WHERE id = $1",
      [friendshipId]
    );
  },

  async rejectFriendRequest(friendshipId: number) {
    await pool.query(
      "UPDATE friendships SET status = 'rejected' WHERE id = $1",
      [friendshipId]
    );
  },

  async getFriendshipBetweenUsers(userId: number, friendId: number) {
    const res = await pool.query(
      "SELECT * FROM friendships WHERE (user_id = $1 AND friend_id = $2) OR (user_id = $2 AND friend_id = $1)",
      [userId, friendId]
    );
    return res.rows[0];
  },

  async removeFriend(userId: number, friendId: number) {
    await pool.query(
      "DELETE FROM friendships WHERE (user_id = $1 AND friend_id = $2) OR (user_id = $2 AND friend_id = $1)",
      [userId, friendId]
    );
  },

  async deleteServer(serverId: number, userId: number) {
    await pool.query("DELETE FROM servers WHERE id = $1 AND owner_id = $2", [serverId, userId]);
  },

  async addServerMember(serverId: number, userId: number) {
    await pool.query(
      "INSERT INTO server_members (server_id, user_id) VALUES ($1, $2)",
      [serverId, userId]
    );
  },
};