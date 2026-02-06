import * as React from "react";
import { Bell, BellOff, Smartphone } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { oneSignalService } from "@/services/onesignal";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

export const PushNotificationToggle: React.FC = () => {
  const { user, profile } = useAuth();
  const [isEnabled, setIsEnabled] = React.useState(oneSignalService.isPushEnabled());
  const [isLoading, setIsLoading] = React.useState(false);

  const isPWA = oneSignalService.isStandalonePWA();
  const isSupported = oneSignalService.isPushSupported();

  React.useEffect(() => {
    if (user) {
      oneSignalService.init(user.id);
    }
  }, [user]);

  const handleToggle = async (checked: boolean) => {
    if (!user) return;

    setIsLoading(true);
    const displayName = profile?.nickname || profile?.full_name || "Ukjent";

    try {
      if (checked) {
        const success = await oneSignalService.enablePush(user.id, displayName);
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

  // Not installed as PWA - show install instructions
  if (!isPWA) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-3 px-4 py-3 bg-card rounded-lg border">
          <Bell className="h-5 w-5 text-muted-foreground" />
          <div className="flex-1">
            <p className="text-sm font-medium">Push-varsler</p>
            <p className="text-xs text-muted-foreground">
              Krever installasjon på hjemskjermen
            </p>
          </div>
          <Switch checked={false} disabled />
        </div>

        <div className="flex items-start gap-3 px-4 py-3 bg-warning/10 border border-warning/20 rounded-lg">
          <Smartphone className="h-5 w-5 text-warning mt-0.5 shrink-0" />
          <div className="flex-1 space-y-2">
            <p className="text-sm font-medium text-warning">
              Installer appen først
            </p>
            <p className="text-xs text-warning/80">
              Push-varsler krever at Lift & Lager installeres på hjemskjermen:
            </p>
            <ol className="text-xs text-warning/80 list-decimal list-inside space-y-1">
              <li>Trykk på <strong>Del</strong>-ikonet (firkant med pil opp) i Safari</li>
              <li>Velg <strong>"Legg til på Hjem-skjerm"</strong></li>
              <li>Åpne appen derfra og aktiver varsler</li>
            </ol>
          </div>
        </div>
      </div>
    );
  }

  // PWA mode - functional toggle
  return (
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
  );
};
