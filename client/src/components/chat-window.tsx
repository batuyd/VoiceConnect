import { useLanguage } from "@/hooks/use-language";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Channel } from "@shared/schema";
import { Send } from "lucide-react";
import { useState } from "react";

export function ChatWindow({ channel }: { channel: Channel }) {
  const { t } = useLanguage();
  const [message, setMessage] = useState("");

  const handleSend = () => {
    if (!message.trim()) return;
    // TODO: Implement message sending
    setMessage("");
  };

  return (
    <div className="flex-1 bg-gray-800 flex flex-col">
      {/* Channel Header */}
      <div className="px-4 py-3 border-b border-gray-700 flex items-center">
        <h2 className="font-semibold">#{channel.name}</h2>
      </div>

      {/* Messages Area */}
      <div className="flex-1 p-4 overflow-y-auto">
        {/* TODO: Implement message list */}
        <div className="text-gray-400 text-center mt-4">
          {t('chat.welcome')} #{channel.name}
        </div>
      </div>

      {/* Message Input */}
      <div className="p-4 border-t border-gray-700">
        <form 
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="flex gap-2"
        >
          <Input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={`${t('chat.messagePlaceholder')} #${channel.name}`}
            className="flex-1"
          />
          <Button type="submit" size="icon">
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </div>
    </div>
  );
}
