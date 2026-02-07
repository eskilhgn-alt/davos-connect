import * as React from "react";
import { Bell, BellOff, Smartphone, AlertTriangle, Loader2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { oneSignalService } from "@/services/onesignal";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

export const PushNotificationToggle: React.FC = () => {
  const { user, profile } = useAuth();
  const [isEnabled, setIsEnabled] = React.useState(oneSignalService.isPushEnabled());
  const [isLoading, setIsLoading] = React.useState(false);
  const [initState, setInitState] = React.useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  const isPWA = oneSignalService.isStandalonePWA();
  const isSupported = oneSignalService.isPushSupported();

  // Initialize OneSignal and track state
  React.useEffect(() => {
    if (!user || !isPWA || !isSupported) return;

    let cancelled = false;
    setInitState('loading');
    setErrorMsg(null);

    const initWithTimeout = async () => {
      try {
        // Race between init and a 10s timeout
        const result = await Promise.race([
          oneSignalService.init(user.id).then(() => 'ok' as const),
          new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), 10000)),
        ]);

        if (cancelled) return;

        if (result === 'timeout') {
          setInitState('error');
          setErrorMsg('OneSignal tok for lang tid å laste. Prøv å lukke og åpne appen på nytt.');
        } else {
          setInitState('ready');
          // Sync with actual state
          setIsEnabled(oneSignalService.isPushEnabled());
        }
      } catch (err) {
        if (cancelled) return;
        console.error('OneSignal init error:', err);
        setInitState('error');
        setErrorMsg(err instanceof Error ? err.message : 'Ukjent feil ved initialisering');
      }
    };

    initWithTimeout();
    return () => { cancelled = true; };
  }, [user, isPWA, isSupported]);

  const handleToggle = async (checked: boolean) => {
    if (!user) return;
    if (initState !== 'ready') {
      setErrorMsg('OneSignal er ikke klar ennå. Vent litt og prøv igjen.');
      return;
    }

    setIsLoading(true);
    setErrorMsg(null);
    const displayName = profile?.nickname || profile?.full_name || "Ukjent";

    try {
      if (checked) {
        const success = await oneSignalService.enablePush(user.id, displayName);
        if (success) {
          setIsEnabled(true);
        } else {
          setErrorMsg('Kunne ikke aktivere push. Sjekk at du har godkjent varsler i iOS-innstillinger.');
          setIsEnabled(false);
        }
      } else {
        await oneSignalService.disablePush(user.id);
        setIsEnabled(false);
      }
    } catch (error) {
      console.error("Error toggling push:", error);
      setErrorMsg(error instanceof Error ? error.message : 'Ukjent feil');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isSupported) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-3 px-4 py-3 bg-muted/50 rounded-lg">
          <BellOff className="h-5 w-5 text-muted-foreground" />
          <div className="flex-1">
            <p className="text-sm font-medium">Push-varsler</p>
            <p className="text-xs text-muted-foreground">
              Ikke støttet i denne nettleseren
            </p>
          </div>
        </div>
        {!isPWA && (
          <div className="flex items-start gap-3 px-4 py-3 bg-warning/10 border border-warning/20 rounded-lg">
            <Smartphone className="h-5 w-5 text-warning mt-0.5 shrink-0" />
            <div className="flex-1 space-y-2">
              <p className="text-sm font-medium text-warning">Installer appen først</p>
              <p className="text-xs text-warning/80">
                Push-varsler krever at Glühwein installeres på hjemskjermen:
              </p>
              <ol className="text-xs text-warning/80 list-decimal list-inside space-y-1">
                <li>Trykk på <strong>Del</strong>-ikonet (firkant med pil opp) i Safari</li>
                <li>Velg <strong>"Legg til på Hjem-skjerm"</strong></li>
                <li>Åpne appen derfra og aktiver varsler</li>
              </ol>
            </div>
          </div>
        )}
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
              Push-varsler krever at Glühwein installeres på hjemskjermen:
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
    <div className="space-y-3">
      <div className="flex items-center gap-3 px-4 py-3 bg-card rounded-lg border">
        <Bell className={cn("h-5 w-5", isEnabled ? "text-primary" : "text-muted-foreground")} />
        <div className="flex-1">
          <p className="text-sm font-medium">Push-varsler</p>
          <p className="text-xs text-muted-foreground">
            {initState === 'loading' && 'Kobler til…'}
            {initState === 'ready' && (isEnabled ? "Aktivert – du får beskjed om nye meldinger" : "Deaktivert")}
            {initState === 'error' && 'Feil ved tilkobling'}
            {initState === 'idle' && 'Initialiserer…'}
          </p>
        </div>
        {(isLoading || initState === 'loading') ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : (
          <Switch
            checked={isEnabled}
            onCheckedChange={handleToggle}
            disabled={initState !== 'ready'}
          />
        )}
      </div>

      {errorMsg && (
        <div className="flex items-start gap-3 px-4 py-3 bg-destructive/10 border border-destructive/20 rounded-lg">
          <AlertTriangle className="h-5 w-5 text-destructive mt-0.5 shrink-0" />
          <p className="text-xs text-destructive/90">{errorMsg}</p>
        </div>
      )}

      {initState === 'ready' && !isEnabled && !errorMsg && (
        <p className="text-xs text-muted-foreground px-4">
          Når aktivert mottar du varsler om nye meldinger i chatten, selv når appen er lukket.
        </p>
      )}
    </div>
  );
};
