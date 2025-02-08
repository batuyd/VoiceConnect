import { useQuery, useMutation } from "@tanstack/react-query";
import { useLanguage } from "@/hooks/use-language";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { User, ServerInvite } from "@shared/schema";
import { Volume2, VolumeX, Bell } from "lucide-react";
import { UserContextMenu } from "./user-context-menu";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useEffect, useRef } from "react";
import { useAuth } from "@/hooks/use-auth";

const setupWebSocket = () => {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const wsUrl = `${protocol}//${window.location.host}/ws`;

  console.log("Trying to connect WebSocket to:", wsUrl);

  const ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    console.log("WebSocket connection established");
    // Send authentication message
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'authenticate' }));
    }
  };

  ws.onclose = (event) => {
    console.log("WebSocket connection closed:", event.code, event.reason);
  };

  ws.onerror = (error) => {
    console.error("WebSocket connection error:", error);
  };

  return ws;
};

export function UserList({ serverId }: { serverId: number }) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const { user: currentUser } = useAuth();
  const wsRef = useRef<WebSocket | null>(null);

  const { data: users = [] } = useQuery<User[]>({
    queryKey: [`/api/servers/${serverId}/members`],
  });

  const { data: invites = [] } = useQuery<ServerInvite[]>({
    queryKey: ["/api/invites"],
  });

  useEffect(() => {
    if (!currentUser) return;

    console.log("Setting up WebSocket for user:", currentUser.id);

    // WebSocket bağlantısını kur
    const ws = setupWebSocket();
    wsRef.current = ws;

    // Mesaj işleme
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log("WebSocket message received:", data);

        switch (data.type) {
          case "friend_request":
            toast({
              title: t("friends.newRequest"),
              description: `${data.from.username} ${t("friends.requestReceived")}`,
            });
            queryClient.invalidateQueries({ queryKey: ["/api/friends"] });
            queryClient.invalidateQueries({ queryKey: ["/api/friends/requests"] });
            break;

          case "friend_request_accepted":
            toast({
              title: t("friends.requestAccepted"),
              description: `${data.by.username} ${t("friends.requestAcceptedBy")}`,
            });
            queryClient.invalidateQueries({ queryKey: ["/api/friends"] });
            break;

          default:
            console.log("Unknown message type:", data.type);
        }
      } catch (error) {
        console.error("Error processing WebSocket message:", error);
      }
    };

    // Cleanup
    return () => {
      console.log("Cleaning up WebSocket connection");
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.close();
      }
    };
  }, [currentUser, toast, t]);

  // WebSocket yeniden bağlanma mantığı
  useEffect(() => {
    const reconnectInterval = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.CLOSED) {
        console.log("Attempting to reconnect WebSocket...");
        const ws = setupWebSocket();
        wsRef.current = ws;
      }
    }, 5000); // Her 5 saniyede bir kontrol et

    return () => clearInterval(reconnectInterval);
  }, []);

  const acceptInviteMutation = useMutation({
    mutationFn: async (inviteId: number) => {
      const res = await apiRequest("POST", `/api/invites/${inviteId}/accept`);
      if (!res.ok) throw new Error("Failed to accept invite");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/invites"] });
      queryClient.invalidateQueries({ queryKey: ["/api/servers"] });
      toast({
        title: t('server.inviteAccepted'),
        description: t('server.inviteAcceptedDesc'),
      });
    },
  });

  const rejectInviteMutation = useMutation({
    mutationFn: async (inviteId: number) => {
      const res = await apiRequest("POST", `/api/invites/${inviteId}/reject`);
      if (!res.ok) throw new Error("Failed to reject invite");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/invites"] });
      toast({
        title: t('server.inviteRejected'),
        description: t('server.inviteRejectedDesc'),
      });
    },
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
      <div className="flex justify-between items-center">
        <h2 className="font-semibold mb-4 text-sm md:text-base">
          {t('server.members')} - {users.length}
        </h2>
        {invites.length > 0 && (
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="ghost" size="icon" className="relative">
                <Bell className="h-4 w-4" />
                <span className="absolute -top-1 -right-1 h-4 w-4 bg-red-500 rounded-full text-xs flex items-center justify-center">
                  {invites.length}
                </span>
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t('server.pendingInvites')}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                {invites.map((invite) => (
                  <div key={invite.id} className="flex items-center justify-between gap-4 p-2 bg-gray-700 rounded">
                    <span>{t('server.inviteFrom')} Server {invite.serverId}</span>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => acceptInviteMutation.mutate(invite.id)}
                        disabled={acceptInviteMutation.isPending}
                      >
                        {t('server.accept')}
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => rejectInviteMutation.mutate(invite.id)}
                        disabled={rejectInviteMutation.isPending}
                      >
                        {t('server.reject')}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>
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