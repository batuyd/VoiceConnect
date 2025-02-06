import { useAuth } from "@/hooks/use-auth";
import { useLanguage } from "@/hooks/use-language";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { InsertUser, insertUserSchema } from "@shared/schema";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft } from "lucide-react";
import { useLocation } from "wouter";

export default function ProfilePage() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const profileForm = useForm({
    resolver: zodResolver(insertUserSchema.pick({ 
      bio: true, 
      age: true,
      avatar: true 
    })),
    defaultValues: {
      bio: user?.bio || "",
      age: user?.age || undefined,
      avatar: user?.avatar || ""
    }
  });

  const updateProfileMutation = useMutation({
    mutationFn: async (data: Partial<InsertUser>) => {
      const res = await apiRequest("PATCH", "/api/user/profile", data);
      return res.json();
    },
    onSuccess: (updatedUser) => {
      queryClient.setQueryData(["/api/user"], updatedUser);
      toast({
        title: t('profile.updateSuccess'),
        description: t('profile.profileUpdated'),
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

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
      <Card className="w-full max-w-2xl">
        <CardHeader className="flex flex-row items-center space-x-4">
          <Button 
            variant="ghost" 
            size="icon"
            onClick={() => setLocation("/")}
            className="shrink-0"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <CardTitle>{t('profile.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          <form 
            onSubmit={profileForm.handleSubmit((data) => updateProfileMutation.mutate(data))}
            className="space-y-6"
          >
            <div className="flex flex-col items-center space-y-4">
              <Avatar className="w-32 h-32">
                <AvatarImage src={user?.avatar} />
                <AvatarFallback>{user?.username[0]}</AvatarFallback>
              </Avatar>
              <div className="w-full">
                <Label htmlFor="avatar">{t('profile.avatarUrl')}</Label>
                <Input
                  id="avatar"
                  {...profileForm.register("avatar")}
                />
              </div>
            </div>

            <div>
              <Label htmlFor="bio">{t('profile.bio')}</Label>
              <Textarea
                id="bio"
                {...profileForm.register("bio")}
                className="h-32"
              />
            </div>

            <div>
              <Label htmlFor="age">{t('profile.age')}</Label>
              <Input
                id="age"
                type="number"
                {...profileForm.register("age", { valueAsNumber: true })}
              />
            </div>

            <Button 
              type="submit"
              disabled={updateProfileMutation.isPending}
              className="w-full"
            >
              {t('profile.saveChanges')}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}