import { useQuery, useMutation } from "@tanstack/react-query";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from "@/components/ui/context-menu";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/use-language";
import { useAuth } from "@/hooks/use-auth";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { UserPlus, UserMinus, Ban, UserCheck } from "lucide-react";
import type { User } from "@shared/schema";

interface Props {
  targetUser: User;
  children: React.ReactNode;
}

export function UserContextMenu({ targetUser, children }: Props) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const { user } = useAuth();

  const { data: friends } = useQuery<User[]>({
    queryKey: ["/api/friends"],
  });

  const isFriend = friends?.some(friend => friend.id === targetUser.id);

  const addFriendMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/friends/${targetUser.id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/friends"] });
      toast({
        title: t('friends.addSuccess'),
        description: t('friends.addSuccessDescription', { username: targetUser.username }),
      });
    },
    onError: (error: Error) => {
      toast({
        title: t('friends.addError'),
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const removeFriendMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("DELETE", `/api/friends/${targetUser.id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/friends"] });
      toast({
        title: t('friends.removeSuccess'),
        description: t('friends.removeSuccessDescription', { username: targetUser.username }),
      });
    },
    onError: (error: Error) => {
      toast({
        title: t('friends.removeError'),
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const blockUserMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/blocks/${targetUser.id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/blocks"] });
      toast({
        title: t('blocks.addSuccess'),
        description: t('blocks.addSuccessDescription', { username: targetUser.username }),
      });
    },
    onError: (error: Error) => {
      toast({
        title: t('blocks.addError'),
        description: error.message,
        variant: "destructive",
      });
    },
  });

  if (user?.id === targetUser.id) {
    return children;
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger>{children}</ContextMenuTrigger>
      <ContextMenuContent>
        {isFriend ? (
          <ContextMenuItem 
            onClick={() => removeFriendMutation.mutate()}
            className="text-red-500"
          >
            <UserMinus className="mr-2 h-4 w-4" />
            {t('friends.remove')}
          </ContextMenuItem>
        ) : (
          <ContextMenuItem onClick={() => addFriendMutation.mutate()}>
            <UserPlus className="mr-2 h-4 w-4" />
            {t('friends.add')}
          </ContextMenuItem>
        )}
        <ContextMenuItem onClick={() => blockUserMutation.mutate()} className="text-red-500">
          <Ban className="mr-2 h-4 w-4" />
          {t('blocks.add')}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
