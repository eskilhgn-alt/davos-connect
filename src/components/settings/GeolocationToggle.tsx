import * as React from "react";
import { MapPin, MapPinOff, Loader2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useGeolocation } from "@/hooks/useGeolocation";
import { cn } from "@/lib/utils";

export const GeolocationToggle: React.FC = () => {
  const { position, loading, error, enabled, request, disable } = useGeolocation();

  const handleToggle = (checked: boolean) => {
    if (checked) {
      request();
    } else {
      disable();
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 px-4 py-3 bg-card rounded-lg border">
        <MapPin className={cn("h-5 w-5", enabled ? "text-primary" : "text-muted-foreground")} />
        <div className="flex-1">
          <p className="text-sm font-medium">Posisjonstjenester</p>
          <p className="text-xs text-muted-foreground">
            {loading && "Henter posisjon…"}
            {!loading && enabled && position && `Aktiv – ${position.lat.toFixed(2)}°, ${position.lon.toFixed(2)}°`}
            {!loading && enabled && !position && "Venter på posisjon…"}
            {!loading && !enabled && "Deaktivert"}
          </p>
        </div>
        {loading ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : (
          <Switch checked={enabled} onCheckedChange={handleToggle} />
        )}
      </div>

      {error && (
        <div className="flex items-start gap-3 px-4 py-3 bg-destructive/10 border border-destructive/20 rounded-lg">
          <MapPinOff className="h-5 w-5 text-destructive mt-0.5 shrink-0" />
          <p className="text-xs text-destructive/90">{error}</p>
        </div>
      )}

      {!enabled && !error && (
        <p className="text-xs text-muted-foreground px-4">
          Brukes til værradar, kart og posisjonen til Gütta. Data deles ikke utenfor appen.
        </p>
      )}
    </div>
  );
};
