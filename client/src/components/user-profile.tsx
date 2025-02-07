import { useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useLanguage } from "@/hooks/use-language";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Loader2, Edit2, Save } from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { User } from "@shared/schema";

export function UserProfile() {
  const { id } = useParams();
  const { user: currentUser } = useAuth();
  const { t } = useLanguage();
  const { toast } = useToast();
  const isOwnProfile = !id || currentUser?.id === Number(id);

  const { data: profile, isLoading } = useQuery<User>({
    queryKey: [`/api/users/${isOwnProfile ? currentUser?.id : id}`],
    enabled: !!currentUser && (isOwnProfile ? !!currentUser.id : !!id),
  });

  const updateProfileMutation = useMutation({
    mutationFn: async (data: Partial<User>) => {
      const res = await apiRequest(
        "PATCH",
        `/api/users/${currentUser?.id}`,
        data
      );
      if (!res.ok) {
        throw new Error(await res.text());
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/users/${currentUser?.id}`] });
      toast({
        title: t('profile.updateSuccess'),
      });
    },
    onError: (error: Error) => {
      toast({
        title: t('profile.updateError'),
        description: error.message,
        variant: "destructive",
      });
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="text-center py-8">
        <p>{t('profile.notFound')}</p>
      </div>
    );
  }

  const formatDate = (date: Date | string | null | undefined) => {
    if (!date) return '';
    return new Date(date).toLocaleString();
  };

  return (
    <Card className="max-w-2xl mx-auto">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>{isOwnProfile ? t('profile.yourProfile') : profile.username}</CardTitle>
        {isOwnProfile && (
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline" size="icon">
                <Edit2 className="h-4 w-4" />
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t('profile.edit')}</DialogTitle>
              </DialogHeader>
              <form
                className="space-y-4"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const formData = new FormData(e.currentTarget);
                  await updateProfileMutation.mutateAsync({
                    nickname: formData.get("nickname") as string,
                    bio: formData.get("bio") as string,
                    avatar: formData.get("avatar") as string,
                    status: formData.get("status") as string,
                    isPrivateProfile: formData.get("isPrivateProfile") === "on",
                    showLastSeen: formData.get("showLastSeen") === "on",
                  });
                }}
              >
                <div className="space-y-2">
                  <Label htmlFor="nickname">{t('profile.nickname')}</Label>
                  <Input
                    id="nickname"
                    name="nickname"
                    defaultValue={profile.nickname || ""}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bio">{t('profile.bio')}</Label>
                  <Textarea
                    id="bio"
                    name="bio"
                    defaultValue={profile.bio || ""}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="avatar">{t('profile.avatar')}</Label>
                  <Input
                    id="avatar"
                    name="avatar"
                    defaultValue={profile.avatar}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="status">{t('profile.status')}</Label>
                  <Input
                    id="status"
                    name="status"
                    defaultValue={profile.status || ""}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="isPrivateProfile">{t('profile.private')}</Label>
                  <Switch
                    id="isPrivateProfile"
                    name="isPrivateProfile"
                    defaultChecked={profile.isPrivateProfile || false}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="showLastSeen">{t('profile.showLastSeen')}</Label>
                  <Switch
                    id="showLastSeen"
                    name="showLastSeen"
                    defaultChecked={profile.showLastSeen || false}
                  />
                </div>
                <Button
                  type="submit"
                  className="w-full"
                  disabled={updateProfileMutation.isPending}
                >
                  {updateProfileMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4 mr-2" />
                  )}
                  {t('profile.save')}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center gap-4">
          <Avatar className="h-20 w-20">
            <AvatarImage src={profile.avatar} alt={profile.username} />
            <AvatarFallback>{profile.username[0]}</AvatarFallback>
          </Avatar>
          <div>
            <h3 className="text-lg font-semibold">
              {profile.nickname || profile.username}
            </h3>
            <p className="text-sm text-muted-foreground">{profile.status}</p>
          </div>
        </div>
        {(!profile.isPrivateProfile || isOwnProfile) && (
          <>
            {profile.bio && (
              <div>
                <h4 className="font-semibold mb-2">{t('profile.about')}</h4>
                <p className="text-sm">{profile.bio}</p>
              </div>
            )}
            <div>
              <h4 className="font-semibold mb-2">{t('profile.info')}</h4>
              <div className="space-y-1 text-sm">
                <p>{t('profile.joined')}: {formatDate(profile.createdAt)}</p>
                {profile.showLastSeen && profile.lastActive && (
                  <p>
                    {t('profile.lastSeen')}: {formatDate(profile.lastActive)}
                  </p>
                )}
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}