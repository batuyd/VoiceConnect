import { useAuth } from "@/hooks/use-auth";
import { useLanguage } from "@/hooks/use-language";
import { ServerList } from "@/components/server-list";
import { ChannelList } from "@/components/channel-list";
import { UserList } from "@/components/user-list";
import { ChatWindow } from "@/components/chat-window";
import { useState } from "react";
import { Server, Channel } from "@shared/schema";
import { motion } from "framer-motion";
import { Card } from "@/components/ui/card";

export default function HomePage() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [selectedServer, setSelectedServer] = useState<Server | null>(null);
  const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null);

  return (
    <div className="flex h-screen bg-gradient-to-br from-gray-900 to-gray-800">
      <motion.div
        initial={{ x: -20, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 0.3 }}
        className="flex h-full"
      >
        <ServerList onServerSelect={setSelectedServer} selectedServer={selectedServer} />
      </motion.div>

      {selectedServer ? (
        <>
          <motion.div
            initial={{ x: -20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ duration: 0.3, delay: 0.1 }}
            className="flex flex-1 h-full"
          >
            <ChannelList 
              serverId={selectedServer.id} 
              onChannelSelect={setSelectedChannel}
              selectedChannel={selectedChannel}
            />

            {selectedChannel && !selectedChannel.isVoice ? (
              <motion.div 
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ duration: 0.3, delay: 0.2 }}
                className="flex-1 h-full"
              >
                <ChatWindow channel={selectedChannel} />
              </motion.div>
            ) : (
              <motion.div 
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ duration: 0.3 }}
                className="flex-1 flex items-center justify-center p-8"
              >
                <Card className="p-6 text-center bg-gray-800/50 backdrop-blur-sm border-gray-700">
                  <h2 className="text-xl font-semibold mb-2 text-gray-100">
                    {selectedChannel?.isVoice ? t('channel.joinVoice') : t('channel.selectChannel')}
                  </h2>
                  <p className="text-gray-400">
                    {selectedChannel?.isVoice ? t('channel.voiceChannelDesc') : t('channel.channelDesc')}
                  </p>
                </Card>
              </motion.div>
            )}

            <motion.div
              initial={{ x: 20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ duration: 0.3, delay: 0.3 }}
              className="w-64 bg-gray-800/50 backdrop-blur-sm border-l border-gray-700"
            >
              <div className="p-4 border-b border-gray-700">
                <h2 className="font-semibold text-gray-100">{t('server.members')}</h2>
              </div>
              <UserList serverId={selectedServer.id} />
            </motion.div>
          </motion.div>
        </>
      ) : (
        <motion.div 
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.3 }}
          className="flex-1 flex items-center justify-center p-8"
        >
          <Card className="p-8 max-w-md w-full bg-gray-800/50 backdrop-blur-sm border-gray-700">
            <h2 className="text-3xl font-bold mb-4 text-gray-100">
              {t('home.welcome')} {user?.username}!
            </h2>
            <p className="text-gray-400 text-lg">
              {t('home.selectServer')}
            </p>
          </Card>
        </motion.div>
      )}
    </div>
  );
}