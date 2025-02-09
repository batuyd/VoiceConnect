import { Button } from "./ui/button";
import { Drawer } from "vaul";
import { GiftIcon, CoinsIcon, Trophy, Calendar } from "lucide-react";
import { useLanguage } from "@/hooks/use-language";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";

export function UserStatsDrawer() {
  const { t } = useLanguage();
  const { user } = useAuth();

  const { data: coins } = useQuery({
    queryKey: ["/api/coins"],
    enabled: !!user,
  });

  const { data: achievements } = useQuery({
    queryKey: ["/api/achievements"],
    enabled: !!user,
  });

  return (
    <Drawer.Root>
      <Drawer.Trigger asChild>
        <Button variant="outline" size="icon" className="fixed bottom-4 right-4">
          <Trophy className="h-4 w-4" />
        </Button>
      </Drawer.Trigger>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 bg-black/40" />
        <Drawer.Content className="fixed bottom-0 left-0 right-0 mt-24 flex h-[80%] flex-col rounded-t-[10px] bg-background">
          <div className="flex-1 overflow-y-auto rounded-t-[10px] bg-background p-4">
            <div className="mx-auto w-full max-w-md">
              <Drawer.Title className="mb-4 text-lg font-medium">
                {t('profile.stats')}
              </Drawer.Title>
              
              <div className="space-y-4">
                {/* Coins Section */}
                <div className="rounded-lg border p-4">
                  <div className="flex items-center gap-2">
                    <CoinsIcon className="h-5 w-5 text-yellow-500" />
                    <h3 className="font-medium">{t('profile.coins')}</h3>
                  </div>
                  <p className="mt-2 text-2xl font-bold">{coins?.balance || 0}</p>
                </div>

                {/* Achievements Section */}
                <div className="rounded-lg border p-4">
                  <div className="flex items-center gap-2">
                    <Trophy className="h-5 w-5 text-purple-500" />
                    <h3 className="font-medium">{t('profile.achievements')}</h3>
                  </div>
                  <div className="mt-2 space-y-2">
                    {achievements?.map((achievement) => (
                      <div key={achievement.type} className="flex justify-between">
                        <span>{t(`achievements.${achievement.type}`)}</span>
                        <span>{achievement.progress}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Daily Rewards Section */}
                <div className="rounded-lg border p-4">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-5 w-5 text-green-500" />
                    <h3 className="font-medium">{t('profile.dailyRewards')}</h3>
                  </div>
                  <Button
                    className="mt-2 w-full"
                    onClick={() => {
                      // Implement daily reward claim logic
                    }}
                  >
                    {t('profile.claimReward')}
                  </Button>
                </div>

                {/* Gift Shop Section */}
                <div className="rounded-lg border p-4">
                  <div className="flex items-center gap-2">
                    <GiftIcon className="h-5 w-5 text-red-500" />
                    <h3 className="font-medium">{t('profile.giftShop')}</h3>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {/* Add gift shop items here */}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
