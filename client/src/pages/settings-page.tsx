import { useAuth } from "@/hooks/use-auth";
import { useLanguage } from "@/hooks/use-language";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { ArrowLeft } from "lucide-react";
import { useLocation } from "wouter";
import { useState } from "react";

export default function SettingsPage() {
  const { t } = useLanguage();
  const [, setLocation] = useLocation();
  const [inputVolume, setInputVolume] = useState([50]);
  const [outputVolume, setOutputVolume] = useState([50]);

  // Mock devices for demo
  const mockDevices = {
    input: [
      { id: "default", label: "Default Microphone" },
      { id: "mic1", label: "Built-in Microphone" },
      { id: "mic2", label: "External Microphone" },
    ],
    output: [
      { id: "default", label: "Default Speaker" },
      { id: "speaker1", label: "Built-in Speaker" },
      { id: "speaker2", label: "External Speaker" },
    ],
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
              <Select defaultValue="default">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {mockDevices.input.map((device) => (
                    <SelectItem key={device.id} value={device.id}>
                      {device.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Output Device */}
            <div className="space-y-2">
              <Label>{t('settings.audio.outputDevice')}</Label>
              <Select defaultValue="default">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {mockDevices.output.map((device) => (
                    <SelectItem key={device.id} value={device.id}>
                      {device.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Input Volume */}
            <div className="space-y-2">
              <Label>
                {t('settings.audio.inputVolume')} - {inputVolume}%
              </Label>
              <Slider
                value={inputVolume}
                onValueChange={setInputVolume}
                max={100}
                step={1}
              />
            </div>

            {/* Output Volume */}
            <div className="space-y-2">
              <Label>
                {t('settings.audio.outputVolume')} - {outputVolume}%
              </Label>
              <Slider
                value={outputVolume}
                onValueChange={setOutputVolume}
                max={100}
                step={1}
              />
            </div>

            {/* Test Audio Button */}
            <Button className="w-full">
              {t('settings.audio.test')}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
