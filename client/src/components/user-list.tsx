import { useQuery } from "@tanstack/react-query";
import { useLanguage } from "@/hooks/use-language";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { User } from "@shared/schema";
import { Volume2, VolumeX } from "lucide-react";

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
    <div className="w-64 bg-gray-800 p-4">
      <h2 className="font-semibold mb-4">{t('server.members')} - {users.length}</h2>
      <div className="space-y-2">
        {users.map((user) => {
          const status = mockStatus(user.id);
          return (
            <div
              key={user.id}
              className="flex items-center space-x-3 p-2 rounded hover:bg-gray-700"
            >
              <div className="relative">
                <Avatar>
                  <AvatarImage src={user.avatar} alt={user.username} />
                  <AvatarFallback>{user.username[0]}</AvatarFallback>
                </Avatar>
                <div
                  className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-gray-800 ${
                    status.online ? "bg-green-500" : "bg-gray-500"
                  }`}
                />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <span>{user.username}</span>
                  {status.inVoice && (
                    status.muted ? (
                      <VolumeX className="h-4 w-4 text-gray-400" />
                    ) : (
                      <Volume2 className="h-4 w-4 text-green-400" />
                    )
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}