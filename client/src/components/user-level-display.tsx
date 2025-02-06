import { Progress } from "@/components/ui/progress";
import { useQuery } from "@tanstack/react-query";
import { UserLevel } from "@shared/schema";
import { useLanguage } from "@/hooks/use-language";

export function UserLevelDisplay({ userId }: { userId: number }) {
  const { t } = useLanguage();

  const { data: userLevel } = useQuery<UserLevel>({
    queryKey: [`/api/user/level`],
  });

  if (!userLevel) return null;

  const progressPercentage = (userLevel.currentExperience / userLevel.nextLevelExperience) * 100;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">{t('profile.level.title')} {userLevel.level}</h3>
          <p className="text-sm text-gray-500">{userLevel.title}</p>
        </div>
        <div className="text-right">
          <p className="text-sm">{userLevel.currentExperience} / {userLevel.nextLevelExperience}</p>
          <p className="text-xs text-gray-500">{t('profile.level.experience')}</p>
        </div>
      </div>
      <Progress value={progressPercentage} className="h-2" />
    </div>
  );
}
