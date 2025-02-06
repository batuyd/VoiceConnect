import { Volume2 } from "lucide-react";
import { Channel } from "@shared/schema";
import { useState } from "react";
import { Button } from "./ui/button";
import { useLanguage } from "@/hooks/use-language";

export function VoiceChannel({ channel }: { channel: Channel }) {
  const { t } = useLanguage();
  const [isJoined, setIsJoined] = useState(false);

  return (
    <div
      className={`flex items-center justify-between p-2 rounded ${
        isJoined ? "bg-emerald-900/50" : "hover:bg-gray-700"
      }`}
    >
      <div className="flex items-center space-x-2">
        <Volume2 className="h-4 w-4 text-gray-400" />
        <span>{channel.name}</span>
      </div>
      <Button
        variant={isJoined ? "destructive" : "default"}
        size="sm"
        onClick={() => setIsJoined(!isJoined)}
      >
        {isJoined ? t('server.leave') : t('server.join')}
      </Button>
    </div>
  );
}