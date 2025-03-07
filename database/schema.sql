-- Users table
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(255) UNIQUE NOT NULL,
  nickname VARCHAR(255),
  password VARCHAR(255) NOT NULL,
  avatar VARCHAR(255),
  email VARCHAR(255) UNIQUE NOT NULL,
  phone VARCHAR(20),
  bio TEXT,
  status TEXT,
  age INT,
  last_active TIMESTAMP,
  social_links JSONB,
  theme VARCHAR(50) DEFAULT 'system',
  is_private_profile BOOLEAN DEFAULT FALSE,
  show_last_seen BOOLEAN DEFAULT TRUE,
  two_factor_enabled BOOLEAN DEFAULT FALSE,
  two_factor_secret VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Friend requests table
CREATE TABLE IF NOT EXISTS friend_requests (
  id SERIAL PRIMARY KEY,
  sender_id INT REFERENCES users(id) ON DELETE CASCADE,
  receiver_id INT REFERENCES users(id) ON DELETE CASCADE,
  status VARCHAR(50) DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Friendships table
CREATE TABLE IF NOT EXISTS friendships (
  id SERIAL PRIMARY KEY,
  user_id INT REFERENCES users(id) ON DELETE CASCADE,
  friend_id INT REFERENCES users(id) ON DELETE CASCADE,
  status VARCHAR(50) DEFAULT 'accepted',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Coins table
CREATE TABLE IF NOT EXISTS coins (
  id SERIAL PRIMARY KEY,
  user_id INT REFERENCES users(id) ON DELETE CASCADE,
  amount INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Achievements table
CREATE TABLE IF NOT EXISTS achievements (
  id SERIAL PRIMARY KEY,
  user_id INT REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(50),
  progress INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Servers table
CREATE TABLE IF NOT EXISTS servers (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  owner_id INT REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Server members table
CREATE TABLE IF NOT EXISTS server_members (
  id SERIAL PRIMARY KEY,
  server_id INT REFERENCES servers(id) ON DELETE CASCADE,
  user_id INT REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Channels table
CREATE TABLE IF NOT EXISTS channels (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  server_id INT REFERENCES servers(id) ON DELETE CASCADE,
  is_voice BOOLEAN DEFAULT FALSE,
  is_private BOOLEAN DEFAULT FALSE,
  current_media JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Channel members table
CREATE TABLE IF NOT EXISTS channel_members (
  id SERIAL PRIMARY KEY,
  channel_id INT REFERENCES channels(id) ON DELETE CASCADE,
  user_id INT REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Messages table
CREATE TABLE IF NOT EXISTS messages (
  id SERIAL PRIMARY KEY,
  channel_id INT REFERENCES channels(id) ON DELETE CASCADE,
  user_id INT REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Reactions table
CREATE TABLE IF NOT EXISTS reactions (
  id SERIAL PRIMARY KEY,
  message_id INT REFERENCES messages(id) ON DELETE CASCADE,
  user_id INT REFERENCES users(id) ON DELETE CASCADE,
  emoji VARCHAR(50) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Server invites table
CREATE TABLE IF NOT EXISTS server_invites (
  id SERIAL PRIMARY KEY,
  server_id INT REFERENCES servers(id) ON DELETE CASCADE,
  sender_id INT REFERENCES users(id) ON DELETE CASCADE,
  receiver_id INT REFERENCES users(id) ON DELETE CASCADE,
  status VARCHAR(50) DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Media queue table
CREATE TABLE IF NOT EXISTS media_queue (
  id SERIAL PRIMARY KEY,
  channel_id INT REFERENCES channels(id) ON DELETE CASCADE,
  type VARCHAR(50),
  url TEXT,
  title TEXT,
  queued_by INT REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Gift history table
CREATE TABLE IF NOT EXISTS gift_history (
  id SERIAL PRIMARY KEY,
  sender_id INT REFERENCES users(id) ON DELETE CASCADE,
  receiver_id INT REFERENCES users(id) ON DELETE CASCADE,
  gift_id INT,
  message TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Levels table
CREATE TABLE IF NOT EXISTS levels (
  id SERIAL PRIMARY KEY,
  user_id INT REFERENCES users(id) ON DELETE CASCADE,
  level INT DEFAULT 1,
  experience INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
