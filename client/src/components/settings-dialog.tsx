import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Settings, Globe, Moon, Sun, Monitor, Volume2, PlayCircle } from "lucide-react";
import { useLanguage } from "@/hooks/use-language";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useState } from "react";
import { useTheme } from "@/hooks/use-theme";
import { useAudioSettings } from "@/hooks/use-audio-settings";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";

export function SettingsDialog() {
  const { language, setLanguage } = useLanguage();
  const { theme, setTheme } = useTheme();
  const {
    volume,
    setVolume,
    audioDevices,
    selectedInputDevice,
    setSelectedInputDevice,
    selectedOutputDevice,
    setSelectedOutputDevice,
    playTestSound,
  } = useAudioSettings();
  const [open, setOpen] = useState(false);

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
          <DialogTitle>Ayarlar</DialogTitle>
        </DialogHeader>
        <div className="space-y-6">
          <div>
            <div className="flex items-center gap-2 mb-4">
              <Globe className="h-4 w-4" />
              <h4 className="font-medium">Dil Ayarları</h4>
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
            <h4 className="font-medium mb-4">Tema Ayarları</h4>
            <RadioGroup
              value={theme}
              onValueChange={(value) => setTheme(value as "light" | "dark" | "system")}
              className="grid gap-4"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="light" id="light" />
                <Label htmlFor="light" className="flex items-center gap-2">
                  <Sun className="h-4 w-4" />
                  Açık Tema
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="dark" id="dark" />
                <Label htmlFor="dark" className="flex items-center gap-2">
                  <Moon className="h-4 w-4" />
                  Koyu Tema
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="system" id="system" />
                <Label htmlFor="system" className="flex items-center gap-2">
                  <Monitor className="h-4 w-4" />
                  Sistem Teması
                </Label>
              </div>
            </RadioGroup>
          </div>

          <Separator />

          <div>
            <h4 className="font-medium mb-4">Ses Ayarları</h4>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Giriş Cihazı</Label>
                <Select
                  value={selectedInputDevice}
                  onValueChange={setSelectedInputDevice}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Mikrofon seçin" />
                  </SelectTrigger>
                  <SelectContent>
                    {audioDevices
                      .filter(device => device.kind === 'audioinput')
                      .map(device => (
                        <SelectItem key={device.deviceId} value={device.deviceId}>
                          {device.label || `Mikrofon ${device.deviceId.slice(0, 5)}...`}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Çıkış Cihazı</Label>
                <Select
                  value={selectedOutputDevice}
                  onValueChange={setSelectedOutputDevice}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Hoparlör seçin" />
                  </SelectTrigger>
                  <SelectContent>
                    {audioDevices
                      .filter(device => device.kind === 'audiooutput')
                      .map(device => (
                        <SelectItem key={device.deviceId} value={device.deviceId}>
                          {device.label || `Hoparlör ${device.deviceId.slice(0, 5)}...`}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Ses Seviyesi</Label>
                <div className="flex items-center space-x-2">
                  <Volume2 className="h-4 w-4 text-gray-400" />
                  <Slider
                    value={volume}
                    onValueChange={setVolume}
                    max={100}
                    step={1}
                    className="flex-1"
                  />
                  <span className="text-xs text-gray-400 w-8">{volume}%</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => playTestSound()}
                  >
                    <PlayCircle className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}