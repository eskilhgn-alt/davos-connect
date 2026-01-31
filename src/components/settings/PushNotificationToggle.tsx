import * as React from "react";
import { Bell, BellOff, Smartphone, AlertCircle } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { oneSignalService } from "@/services/onesignal";
import { chatStore } from "@/chat/store";
import { cn } from "@/lib/utils";

export const PushNotificationToggle: React.FC = () => {
  const [isEnabled, setIsEnabled] = React.useState(oneSignalService.isPushEnabled());
  const [isLoading, setIsLoading] = React.useState(false);
  const [showPWAHint, setShowPWAHint] = React.useState(false);

  const isPWA = oneSignalService.isStandalonePWA();
  const isSupported = oneSignalService.isPushSupported();

  React.useEffect(() => {
    // Initialize OneSignal when component mounts
    const user = chatStore.getUser();
    oneSignalService.init(user.id);
  }, []);

  const handleToggle = async (checked: boolean) => {
    // If not PWA and trying to enable, show hint
    if (checked && !isPWA) {
      setShowPWAHint(true);
      return;
    }

    setIsLoading(true);
    const user = chatStore.getUser();

    try {
      if (checked) {
        const success = await oneSignalService.enablePush(user.id, user.name);
        setIsEnabled(success);
      } else {
        await oneSignalService.disablePush(user.id);
        setIsEnabled(false);
      }
    } catch (error) {
      console.error("Error toggling push:", error);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isSupported) {
    return (
      <div className="flex items-center gap-3 px-4 py-3 bg-muted/50 rounded-lg">
        <BellOff className="h-5 w-5 text-muted-foreground" />
        <div className="flex-1">
          <p className="text-sm font-medium">Push-varsler</p>
          <p className="text-xs text-muted-foreground">
            Ikke støttet i denne nettleseren
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 px-4 py-3 bg-card rounded-lg border">
        <Bell className={cn("h-5 w-5", isEnabled ? "text-primary" : "text-muted-foreground")} />
        <div className="flex-1">
          <p className="text-sm font-medium">Push-varsler</p>
          <p className="text-xs text-muted-foreground">
            {isEnabled ? "Aktivert – du får beskjed om nye meldinger" : "Deaktivert"}
          </p>
        </div>
        <Switch
          checked={isEnabled}
          onCheckedChange={handleToggle}
          disabled={isLoading}
        />
      </div>

      {showPWAHint && !isPWA && (
        <div className="flex items-start gap-3 px-4 py-3 bg-warning/10 border border-warning/20 rounded-lg">
          <Smartphone className="h-5 w-5 text-warning mt-0.5 shrink-0" />
          <div className="flex-1 space-y-2">
            <p className="text-sm font-medium text-warning">
              Installer appen først
            </p>
            <p className="text-xs text-warning/80">
              For push-varsler på iPhone, må du legge til appen på hjemskjermen:
            </p>
            <ol className="text-xs text-warning/80 list-decimal list-inside space-y-1">
              <li>Trykk på <strong>Del</strong>-ikonet (firkant med pil opp)</li>
              <li>Velg <strong>"Legg til på Hjem-skjerm"</strong></li>
              <li>Åpne appen derfra og aktiver varsler</li>
            </ol>
            <button
              onClick={() => setShowPWAHint(false)}
              className="text-xs text-warning underline mt-2"
            >
              Lukk
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
