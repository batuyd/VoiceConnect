import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useLanguage } from "@/hooks/use-language";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Gift, GiftHistory } from "@shared/schema";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useState } from "react";

export function GiftSection() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [selectedGift, setSelectedGift] = useState<Gift | null>(null);
  const [message, setMessage] = useState("");
  const [receiverId, setReceiverId] = useState<number | null>(null);

  const { data: gifts = [] } = useQuery<Gift[]>({
    queryKey: ["/api/gifts"],
  });

  const { data: giftHistory = [] } = useQuery<GiftHistory[]>({
    queryKey: ["/api/gifts/history"],
  });

  const sendGiftMutation = useMutation({
    mutationFn: async ({ receiverId, giftId, message }: { receiverId: number; giftId: number; message?: string }) => {
      const res = await apiRequest("POST", "/api/gifts/send", { receiverId, giftId, message });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/gifts/history"] });
      queryClient.invalidateQueries({ queryKey: ["/api/coins"] });
      toast({
        description: t('profile.gifts.giftSent'),
      });
      setSelectedGift(null);
      setMessage("");
      setReceiverId(null);
    },
    onError: (error: Error) => {
      toast({
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return (
    <div className="space-y-6">
      <Dialog>
        <DialogTrigger asChild>
          <Button>{t('profile.gifts.send')}</Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('profile.gifts.selectGift')}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            {gifts.map((gift) => (
              <Card
                key={gift.id}
                className={`p-4 cursor-pointer ${selectedGift?.id === gift.id ? 'ring-2 ring-primary' : ''}`}
                onClick={() => setSelectedGift(gift)}
              >
                <div className="text-center">
                  <div className="text-4xl mb-2">{gift.icon}</div>
                  <h4 className="font-semibold">{gift.name}</h4>
                  <p className="text-sm text-gray-500">{gift.description}</p>
                  <p className="mt-2">₺{gift.price}</p>
                  <p className="text-xs text-gray-500">+{gift.experiencePoints} XP</p>
                </div>
              </Card>
            ))}
          </div>
          {selectedGift && (
            <div className="space-y-4">
              <Input
                placeholder="Recipient ID"
                type="number"
                onChange={(e) => setReceiverId(parseInt(e.target.value))}
              />
              <Textarea
                placeholder={t('profile.gifts.message')}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
              <Button
                className="w-full"
                disabled={!receiverId || sendGiftMutation.isPending}
                onClick={() => {
                  if (receiverId) {
                    sendGiftMutation.mutate({
                      receiverId,
                      giftId: selectedGift.id,
                      message: message || undefined,
                    });
                  }
                }}
              >
                {t('profile.gifts.sendGift')}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <div className="space-y-4">
        <h3 className="text-lg font-semibold">{t('profile.gifts.history')}</h3>
        <div className="space-y-2">
          {giftHistory.map((history) => (
            <Card key={history.id} className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">
                    {gifts.find(g => g.id === history.giftId)?.icon}{' '}
                    {gifts.find(g => g.id === history.giftId)?.name}
                  </p>
                  {history.message && (
                    <p className="text-sm mt-1 italic">"{history.message}"</p>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-sm">₺{history.coinAmount}</p>
                  <p className="text-xs text-gray-500">
                    {new Date(history.createdAt).toLocaleDateString()}
                  </p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
