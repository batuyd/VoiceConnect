import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Settings, Globe, Moon, Sun, Monitor, Volume2, Loader2, Wand2, Music2 } from "lucide-react";
import { useLanguage } from "@/hooks/use-language";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useState } from "react";
import { useTheme } from "@/hooks/use-theme";
import { useAudioSettings } from "@/hooks/use-audio-settings";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function SettingsDialog() {
  const { language, setLanguage, t } = useLanguage();
  const { theme, setTheme } = useTheme();
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
    voiceEffect,
    setVoiceEffect,
    noiseSuppressionLevel,
    setNoiseSuppressionLevel,
    audioQuality,
    setAudioQuality,
  } = useAudioSettings();

  const [open, setOpen] = useState(false);

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
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="secondary"
          size="icon"
          className="fixed bottom-4 right-4 rounded-full shadow-lg bg-gray-800 hover:bg-gray-700 z-50"
        >
          <Settings className="h-5 w-5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{t('settings.title')}</DialogTitle>
        </DialogHeader>
        <Tabs defaultValue="audio">
          <TabsList className="grid grid-cols-3 gap-4">
            <TabsTrigger value="general">
              <Settings className="h-4 w-4 mr-2" />
              {t('settings.general')}
            </TabsTrigger>
            <TabsTrigger value="audio">
              <Volume2 className="h-4 w-4 mr-2" />
              {t('settings.audio.title')}
            </TabsTrigger>
            <TabsTrigger value="effects">
              <Wand2 className="h-4 w-4 mr-2" />
              {t('settings.effects.title')}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="general">
            <div className="space-y-6">
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <Globe className="h-4 w-4" />
                  <h4 className="font-medium">{t('settings.language')}</h4>
                </div>
                <RadioGroup
                  value={language}
                  onValueChange={(value) => setLanguage(value as "tr" | "en")}
                  className="grid grid-cols-2 gap-4"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="tr" id="tr" />
                    <Label htmlFor="tr">Türkçe</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="en" id="en" />
                    <Label htmlFor="en">English</Label>
                  </div>
                </RadioGroup>
              </div>

              <Separator />

              <div>
                <h4 className="font-medium mb-4">{t('settings.theme.title')}</h4>
                <RadioGroup
                  value={theme}
                  onValueChange={(value) => setTheme(value as "light" | "dark" | "system")}
                  className="grid gap-4"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="light" id="light" />
                    <Label htmlFor="light" className="flex items-center gap-2">
                      <Sun className="h-4 w-4" />
                      {t('settings.theme.light')}
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="dark" id="dark" />
                    <Label htmlFor="dark" className="flex items-center gap-2">
                      <Moon className="h-4 w-4" />
                      {t('settings.theme.dark')}
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="system" id="system" />
                    <Label htmlFor="system" className="flex items-center gap-2">
                      <Monitor className="h-4 w-4" />
                      {t('settings.theme.system')}
                    </Label>
                  </div>
                </RadioGroup>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="audio">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>{t('settings.audio.input')}</Label>
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

              <div className="space-y-2">
                <Label>{t('settings.audio.output')}</Label>
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

              <div className="space-y-2">
                <Label>{t('settings.audio.quality')}</Label>
                <Select value={audioQuality} onValueChange={setAudioQuality}>
                  <SelectTrigger>
                    <SelectValue placeholder={t('settings.audio.selectQuality')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">{t('settings.audio.qualityLow')}</SelectItem>
                    <SelectItem value="medium">{t('settings.audio.qualityMedium')}</SelectItem>
                    <SelectItem value="high">{t('settings.audio.qualityHigh')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>{t('settings.audio.volume')}</Label>
                <div className="flex items-center space-x-2">
                  <Volume2 className="h-4 w-4 text-gray-400" />
                  <div className="flex-1">
                    <Slider
                      value={[volume]}
                      onValueChange={([v]) => setVolume(v)}
                      max={100}
                      step={1}
                      className="relative z-0"
                    />
                  </div>
                  <span className="text-xs text-gray-400 w-8">{volume}%</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleTestSound}
                    disabled={isTestingAudio}
                  >
                    {isTestingAudio ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Music2 className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="effects">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>{t('settings.effects.voice')}</Label>
                <Select value={voiceEffect} onValueChange={setVoiceEffect}>
                  <SelectTrigger>
                    <SelectValue placeholder={t('settings.effects.selectVoice')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t('settings.effects.voiceNone')}</SelectItem>
                    <SelectItem value="pitch-up">{t('settings.effects.voicePitchUp')}</SelectItem>
                    <SelectItem value="pitch-down">{t('settings.effects.voicePitchDown')}</SelectItem>
                    <SelectItem value="robot">{t('settings.effects.voiceRobot')}</SelectItem>
                    <SelectItem value="echo">{t('settings.effects.voiceEcho')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>{t('settings.effects.noiseSuppression')}</Label>
                <Select
                  value={noiseSuppressionLevel}
                  onValueChange={setNoiseSuppressionLevel}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t('settings.effects.selectNoiseSuppression')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="off">{t('settings.effects.noiseSuppressionOff')}</SelectItem>
                    <SelectItem value="low">{t('settings.effects.noiseSuppressionLow')}</SelectItem>
                    <SelectItem value="medium">{t('settings.effects.noiseSuppressionMedium')}</SelectItem>
                    <SelectItem value="high">{t('settings.effects.noiseSuppressionHigh')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}