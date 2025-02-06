import { useAuth } from "@/hooks/use-auth";
import { useLanguage } from "@/hooks/use-language";
import { ServerList } from "@/components/server-list";
import { ChannelList } from "@/components/channel-list";
import { UserList } from "@/components/user-list";
import { ChatWindow } from "@/components/chat-window";
import { useState } from "react";
import { Server, Channel } from "@shared/schema";

export default function HomePage() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [selectedServer, setSelectedServer] = useState<Server | null>(null);
  const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null);

  return (
    <div className="flex h-screen bg-gray-900 text-gray-100">
      <ServerList onServerSelect={setSelectedServer} selectedServer={selectedServer} />

      {selectedServer ? (
        <>
          <ChannelList 
            serverId={selectedServer.id} 
            onChannelSelect={setSelectedChannel}
            selectedChannel={selectedChannel}
          />

          {selectedChannel && !selectedChannel.isVoice ? (
            <ChatWindow channel={selectedChannel} />
          ) : null}

          <div className="w-64 bg-gray-800 flex flex-col">
            <div className="p-4 border-b border-gray-700">
              <h2 className="font-semibold">{t('server.members')}</h2>
            </div>
            <UserList serverId={selectedServer.id} />
          </div>
        </>
      ) : (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <h2 className="text-2xl font-semibold mb-2">{t('home.welcome')} {user?.username}!</h2>
            <p className="text-gray-400">{t('home.selectServer')}</p>
          </div>
        </div>
      )}
    </div>
  );
}