import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/use-language";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Users, UserPlus, MessageSquare, UserMinus, Check, X } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import type { User, Friendship } from "@shared/schema";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

export function FriendList() {
  const { t } = useLanguage();
  const { toast } = useToast();

  // Arkadaşları getir
  const { data: friends = [] } = useQuery<User[]>({
    queryKey: ["/api/friends"],
  });

  // Arkadaşlık isteklerini getir
  const { data: friendRequests = [] } = useQuery<Friendship[]>({
    queryKey: ["/api/friends/requests"],
  });

  const addFriendMutation = useMutation({
    mutationFn: async (username: string) => {
      const res = await apiRequest("POST", "/api/friends", { username });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/friends"] });
      toast({
        title: t('friends.addSuccess'),
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

  const acceptFriendRequestMutation = useMutation({
    mutationFn: async (friendshipId: number) => {
      const res = await apiRequest("POST", `/api/friends/${friendshipId}/accept`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/friends"] });
      queryClient.invalidateQueries({ queryKey: ["/api/friends/requests"] });
      toast({
        title: t('friends.acceptSuccess'),
      });
    },
  });

  const rejectFriendRequestMutation = useMutation({
    mutationFn: async (friendshipId: number) => {
      const res = await apiRequest("POST", `/api/friends/${friendshipId}/reject`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/friends/requests"] });
      toast({
        title: t('friends.rejectSuccess'),
      });
    },
  });

  const removeFriendMutation = useMutation({
    mutationFn: async (friendId: number) => {
      const res = await apiRequest("DELETE", `/api/friends/${friendId}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/friends"] });
      toast({
        title: t('friends.removeSuccess'),
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

  const handleAddFriend = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const username = formData.get("username") as string;
    if (username) {
      addFriendMutation.mutate(username);
      event.currentTarget.reset();
    }
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8 md:h-10 md:w-10">
          <Users className="h-4 w-4 md:h-5 md:w-5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-[90vw] md:max-w-[500px] h-[80vh] md:h-auto overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('friends.title')}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleAddFriend} className="flex gap-2 mb-4">
          <Input 
            name="username"
            placeholder={t('friends.searchPlaceholder')}
            className="flex-1"
          />
          <Button type="submit" disabled={addFriendMutation.isPending}>
            <UserPlus className="h-4 w-4 mr-2" />
            {t('friends.add')}
          </Button>
        </form>

        <Tabs defaultValue="friends">
          <TabsList className="w-full mb-4">
            <TabsTrigger value="friends" className="flex-1">
              {t('friends.list')} ({friends.length})
            </TabsTrigger>
            <TabsTrigger value="requests" className="flex-1">
              {t('friends.requests')} ({friendRequests.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="friends" className="space-y-2">
            {friends.map((friend) => (
              <Card key={friend.id} className="p-3 md:p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-8 w-8 md:h-10 md:w-10">
                      <AvatarImage src={friend.avatar} alt={friend.username} />
                      <AvatarFallback>{friend.username[0]}</AvatarFallback>
                    </Avatar>
                    <span className="text-sm md:text-base">{friend.username}</span>
                  </div>
                  <div className="flex gap-2">
                    <Button 
                      variant="ghost" 
                      size="icon"
                      onClick={() => {
                        // TODO: Implement private messaging
                        toast({
                          title: "Coming soon",
                          description: "Private messaging will be available soon!",
                        });
                      }}
                    >
                      <MessageSquare className="h-4 w-4" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="icon"
                      onClick={() => removeFriendMutation.mutate(friend.id)}
                      disabled={removeFriendMutation.isPending}
                    >
                      <UserMinus className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
            {friends.length === 0 && (
              <div className="text-center text-gray-500 py-4">
                {t('friends.empty')}
              </div>
            )}
          </TabsContent>

          <TabsContent value="requests" className="space-y-2">
            {friendRequests.map((request) => (
              <Card key={request.id} className="p-3 md:p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-8 w-8 md:h-10 md:w-10">
                      <AvatarImage src={request.sender?.avatar} alt={request.sender?.username} />
                      <AvatarFallback>{request.sender?.username?.[0]}</AvatarFallback>
                    </Avatar>
                    <span className="text-sm md:text-base">
                      {request.sender?.username} {t('friends.sentRequest')}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <Button 
                      variant="ghost" 
                      size="icon"
                      onClick={() => acceptFriendRequestMutation.mutate(request.id)}
                      disabled={acceptFriendRequestMutation.isPending}
                    >
                      <Check className="h-4 w-4 text-green-500" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="icon"
                      onClick={() => rejectFriendRequestMutation.mutate(request.id)}
                      disabled={rejectFriendRequestMutation.isPending}
                    >
                      <X className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
            {friendRequests.length === 0 && (
              <div className="text-center text-gray-500 py-4">
                {t('friends.noRequests')}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}