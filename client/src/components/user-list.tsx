import { useQuery } from "@tanstack/react-query";
import { useLanguage } from "@/hooks/use-language";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { User } from "@shared/schema";
import { Volume2, VolumeX } from "lucide-react";
import { UserContextMenu } from "./user-context-menu";

export function UserList({ serverId }: { serverId: number }) {
  const { t } = useLanguage();
  const { data: users = [] } = useQuery<User[]>({
    queryKey: [`/api/servers/${serverId}/members`],
  });

  const mockStatus = (userId: number) => {
    return {
      online: userId % 2 === 0,
      inVoice: userId % 3 === 0,
      muted: userId % 4 === 0,
    };
  };

  return (
    <div className="w-full md:w-64 bg-gray-800 p-4">
      <h2 className="font-semibold mb-4 text-sm md:text-base">{t('server.members')} - {users.length}</h2>
      <div className="space-y-2">
        {users.map((user) => {
          const status = mockStatus(user.id);
          return (
            <UserContextMenu key={user.id} targetUser={user}>
              <div className="flex items-center space-x-2 md:space-x-3 p-2 rounded hover:bg-gray-700 cursor-pointer">
                <div className="relative flex-shrink-0">
                  <Avatar className="h-8 w-8 md:h-10 md:w-10">
                    <AvatarImage src={user.avatar} alt={user.username} />
                    <AvatarFallback>{user.username[0]}</AvatarFallback>
                  </Avatar>
                  <div
                    className={`absolute bottom-0 right-0 w-2 h-2 md:w-3 md:h-3 rounded-full border-2 border-gray-800 ${
                      status.online ? "bg-green-500" : "bg-gray-500"
                    }`}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="truncate text-sm md:text-base">{user.username}</span>
                    {status.inVoice && (
                      status.muted ? (
                        <VolumeX className="h-3 w-3 md:h-4 md:w-4 text-gray-400 flex-shrink-0" />
                      ) : (
                        <Volume2 className="h-3 w-3 md:h-4 md:w-4 text-green-400 flex-shrink-0" />
                      )
                    )}
                  </div>
                </div>
              </div>
            </UserContextMenu>
          );
        })}
      </div>
    </div>
  );
}