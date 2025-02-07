import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/use-language";
import { Coins, Gift, Trophy } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { UserCoins, CoinProduct, UserAchievement } from "@shared/schema";

export function CoinDisplay() {
  const { t } = useLanguage();
  const { toast } = useToast();

  const { data: userCoins } = useQuery<UserCoins>({
    queryKey: ["/api/coins"],
  });

  const { data: products } = useQuery<CoinProduct[]>({
    queryKey: ["/api/coins/products"],
  });

  const { data: achievements } = useQuery<UserAchievement[]>({
    queryKey: ["/api/achievements"],
  });

  const claimDailyRewardMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/coins/daily-reward");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/coins"] });
      toast({
        title: t('coins.dailyReward.title'),
        description: t('coins.dailyReward.success'),
      });
    },
    onError: (error: Error) => {
      toast({
        title: t('coins.dailyReward.title'),
        description: t('coins.dailyReward.error'),
        variant: "destructive",
      });
    },
  });

  return (
    <div className="flex items-center gap-1 md:gap-2">
      {/* Daily Reward Button */}
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 md:h-10 md:w-10"
        onClick={() => claimDailyRewardMutation.mutate()}
        disabled={claimDailyRewardMutation.isPending}
      >
        <Gift className="h-4 w-4 md:h-5 md:w-5" />
      </Button>

      {/* Achievements Button */}
      <Dialog>
        <DialogTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8 md:h-10 md:w-10">
            <Trophy className="h-4 w-4 md:h-5 md:w-5" />
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-[90vw] md:max-w-[500px] h-[80vh] md:h-auto overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('coins.achievements.title')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {achievements?.map((achievement) => (
              <Card key={achievement.id} className="p-3 md:p-4">
                <div className="flex justify-between items-center mb-2">
                  <div className="font-semibold text-sm md:text-base">
                    {t(`coins.achievements.types.${achievement.type}`)}
                  </div>
                  <div className="text-xs md:text-sm text-gray-500">
                    {achievement.completedAt ? (
                      t('coins.achievements.completed')
                    ) : (
                      `${achievement.progress}/${achievement.goal}`
                    )}
                  </div>
                </div>
                <Progress 
                  value={parseFloat(((achievement.progress / achievement.goal) * 100).toFixed(2))} 
                  className="h-1.5 md:h-2"
                />
              </Card>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Coin Balance and Store */}
      <Dialog>
        <DialogTrigger asChild>
          <Button variant="ghost" className="h-8 md:h-10 flex items-center gap-1 md:gap-2 text-sm md:text-base">
            <Coins className="h-4 w-4 md:h-5 md:w-5" />
            <span>{parseFloat(userCoins?.balance?.toString() || "0").toFixed(0)}</span>
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-[90vw] md:max-w-[500px] h-[80vh] md:h-auto overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('coins.store.title')}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 md:gap-4 py-4">
            {products?.map((product) => (
              <Card key={product.id} className="p-3 md:p-4">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-2">
                  <div>
                    <h4 className="font-semibold text-sm md:text-base">{product.name}</h4>
                    <p className="text-xs md:text-sm text-gray-500">{product.description}</p>
                    {product.bonus && parseFloat(product.bonus) > 0 && (
                      <p className="text-xs md:text-sm text-green-500">
                        +{parseFloat(product.bonus)} {t('coins.store.bonus')}
                      </p>
                    )}
                  </div>
                  <Button size="sm" className="w-full md:w-auto">
                    ₺{parseFloat(product.price.toString()).toFixed(2)}
                  </Button>
                </div>
                {product.isPopular && (
                  <div className="absolute -top-2 -right-2 bg-green-500 text-white px-2 py-0.5 rounded-full text-xs">
                    {t('coins.store.popular')}
                  </div>
                )}
              </Card>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}