import { useAuth } from "@/hooks/use-auth";
import { ServerList } from "@/components/server-list";
import { ChannelList } from "@/components/channel-list";
import { UserList } from "@/components/user-list";
import { useState } from "react";
import { Server } from "@shared/schema";

export default function HomePage() {
  const { user } = useAuth();
  const [selectedServer, setSelectedServer] = useState<Server | null>(null);

  return (
    <div className="flex h-screen bg-gray-900 text-gray-100">
      <ServerList onServerSelect={setSelectedServer} selectedServer={selectedServer} />
      
      {selectedServer ? (
        <>
          <ChannelList serverId={selectedServer.id} />
          <UserList serverId={selectedServer.id} />
        </>
      ) : (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <h2 className="text-2xl font-semibold mb-2">Welcome {user?.username}!</h2>
            <p className="text-gray-400">Select a server to get started</p>
          </div>
        </div>
      )}
    </div>
  );
}
