import { useQuery, useMutation } from "@tanstack/react-query";
import { useLanguage } from "@/hooks/use-language";
import { Button } from "@/components/ui/button";
import { Server } from "@shared/schema";
import { Plus, User, LogOut, Trash2, MoreVertical } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState } from "react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";

export function ServerList({ 
  onServerSelect, 
  selectedServer 
}: { 
  onServerSelect: (server: Server | null) => void;
  selectedServer: Server | null;
}) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const { user, logoutMutation } = useAuth();
  const [, setLocation] = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const [newServerName, setNewServerName] = useState("");

  const { data: servers = [] } = useQuery<Server[]>({
    queryKey: ["/api/servers"],
  });

  const createServerMutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await apiRequest("POST", "/api/servers", { name });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/servers"] });
      setIsOpen(false);
      setNewServerName("");
    },
  });

  const deleteServerMutation = useMutation({
    mutationFn: async (serverId: number) => {
      await apiRequest("DELETE", `/api/servers/${serverId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/servers"] });
      if (selectedServer) {
        onServerSelect(null);
      }
      toast({
        title: t('server.deleteSuccess'),
        description: t('server.deleteSuccessMessage'),
      });
    },
    onError: (error: Error) => {
      toast({
        title: t('server.deleteError'),
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return (
    <div className="w-20 bg-gray-800 flex flex-col items-center py-4 space-y-4">
      {/* Profile Section */}
      <div className="mb-4">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="relative rounded-full w-12 h-12 p-0">
              <Avatar className="w-12 h-12">
                <AvatarImage src={user?.avatar} />
                <AvatarFallback>{user?.username[0]}</AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="center" className="w-48">
            <DropdownMenuItem className="flex items-center gap-2" onClick={() => setLocation("/profile")}>
              <User className="w-4 h-4" />
              <span>{t('profile.viewProfile')}</span>
            </DropdownMenuItem>
            <DropdownMenuItem 
              className="flex items-center gap-2 text-destructive"
              onClick={() => logoutMutation.mutate()}
            >
              <LogOut className="w-4 h-4" />
              <span>{t('auth.logout')}</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="w-12 h-[2px] bg-gray-700 rounded mb-4" />

      {/* Server List */}
      {servers.map((server) => (
        <div key={server.id} className="relative group">
          <button
            onClick={() => onServerSelect(server)}
            className={`w-12 h-12 rounded-full bg-gray-700 flex items-center justify-center transition-all ${
              selectedServer?.id === server.id ? "rounded-2xl bg-emerald-600" : ""
            }`}
          >
            {server.name[0].toUpperCase()}
          </button>
          {server.ownerId === user?.id && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="icon"
                  className="absolute -right-8 top-2 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <MoreVertical className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem
                  className="flex items-center gap-2 text-destructive"
                  onClick={() => {
                    if (confirm(t('server.deleteConfirm'))) {
                      deleteServerMutation.mutate(server.id);
                    }
                  }}
                >
                  <Trash2 className="w-4 h-4" />
                  <span>{t('server.delete')}</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      ))}

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogTrigger asChild>
          <Button 
            variant="ghost" 
            size="icon"
            className="rounded-full w-12 h-12"
          >
            <Plus />
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('server.createServer')}</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              createServerMutation.mutate(newServerName);
            }}
            className="space-y-4"
          >
            <div>
              <Label htmlFor="name">{t('server.serverName')}</Label>
              <Input
                id="name"
                value={newServerName}
                onChange={(e) => setNewServerName(e.target.value)}
              />
            </div>
            <Button type="submit" disabled={createServerMutation.isPending}>
              {t('server.createServer')}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}