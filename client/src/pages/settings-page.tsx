import { useAuth } from "@/hooks/use-auth";
import { useLanguage } from "@/hooks/use-language";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Volume2, Loader2 } from "lucide-react";
import { useLocation } from "wouter";
import { useEffect } from "react";
import { useAudioSettings } from "@/hooks/use-audio-settings";
import { useToast } from "@/hooks/use-toast";

export default function SettingsPage() {
  const { t } = useLanguage();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const {
    volume,
    setVolume,
    audioDevices,
    selectedInputDevice,
    setSelectedInputDevice,
    selectedOutputDevice,
    setSelectedOutputDevice,
    playTestSound,
    isTestingAudio,
  } = useAudioSettings();

  const handleTestSound = async () => {
    try {
      await playTestSound();
    } catch (error) {
      console.error('Test sound failed:', error);
      toast({
        title: t('audio.testFailed'),
        description: t('audio.testFailedDesc'),
        variant: 'destructive',
      });
    }
  };

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
          <CardTitle>{t('settings.title')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Audio Settings */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">{t('settings.audio.title')}</h3>

            {/* Input Device */}
            <div className="space-y-2">
              <Label>{t('settings.audio.inputDevice')}</Label>
              <Select
                value={selectedInputDevice}
                onValueChange={setSelectedInputDevice}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('settings.audio.selectInput')} />
                </SelectTrigger>
                <SelectContent>
                  {audioDevices
                    .filter(device => device.kind === 'audioinput')
                    .map(device => (
                      <SelectItem key={device.deviceId} value={device.deviceId}>
                        {device.label || t('settings.audio.defaultDevice')}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            {/* Output Device */}
            <div className="space-y-2">
              <Label>{t('settings.audio.outputDevice')}</Label>
              <Select
                value={selectedOutputDevice}
                onValueChange={setSelectedOutputDevice}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t('settings.audio.selectOutput')} />
                </SelectTrigger>
                <SelectContent>
                  {audioDevices
                    .filter(device => device.kind === 'audiooutput')
                    .map(device => (
                      <SelectItem key={device.deviceId} value={device.deviceId}>
                        {device.label || t('settings.audio.defaultDevice')}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            {/* Volume Controls */}
            <div className="space-y-2">
              <Label>
                {t('settings.audio.volume')} - {volume[0]}%
              </Label>
              <div className="flex items-center space-x-2">
                <Volume2 className="h-4 w-4 text-gray-400" />
                <div className="flex-1">
                  <Slider
                    value={volume}
                    onValueChange={setVolume}
                    max={100}
                    step={1}
                    className="relative z-0"
                  />
                  <div
                    className="h-1 bg-primary/20 rounded-full mt-1 transition-all duration-200"
                    style={{
                      width: `${volume[0]}%`,
                      opacity: selectedInputDevice ? 1 : 0
                    }}
                  />
                </div>
                <span className="text-xs text-gray-400 w-8">{volume[0]}%</span>
              </div>
            </div>

            {/* Test Audio Button */}
            <Button 
              className="w-full" 
              onClick={handleTestSound}
              disabled={isTestingAudio}
            >
              {isTestingAudio ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : null}
              {t('settings.audio.test')}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}