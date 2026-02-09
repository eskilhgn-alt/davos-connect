/**
 * PermissionPrompt — shown once after login to request push + location permissions
 */
import * as React from "react";
import { Bell, MapPin, Camera, X } from "lucide-react";
import { DavosButton } from "@/components/ui/davos-button";
import { useGeolocation } from "@/hooks/useGeolocation";
import { oneSignalService } from "@/services/onesignal";
import { useAuth } from "@/contexts/AuthContext";

const DISMISSED_KEY = "permissions-prompt-dismissed";

export const PermissionPrompt: React.FC = () => {
  const { user, profile } = useAuth();
  const geo = useGeolocation();
  const [visible, setVisible] = React.useState(false);
  const [step, setStep] = React.useState<"push" | "location" | "camera" | "done">("push");
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (!user) return;
    try {
      const dismissed = localStorage.getItem(DISMISSED_KEY);
      if (dismissed) return;
    } catch { /* */ }

    // Delay showing to avoid overlapping with login toast
    const timer = setTimeout(() => {
      const pushEnabled = oneSignalService.isPushEnabled();
      const locationEnabled = geo.enabled;

      if (!pushEnabled || !locationEnabled) {
        setVisible(true);
        setStep(!pushEnabled ? "push" : "location");
      }
    }, 2000);
    return () => clearTimeout(timer);
  }, [user, geo.enabled]);

  const dismiss = () => {
    setVisible(false);
    try {
      localStorage.setItem(DISMISSED_KEY, "true");
    } catch { /* */ }
  };

  const handlePush = async () => {
    if (!user) return;
    setLoading(true);
    const isPWA = oneSignalService.isStandalonePWA();
    const isSupported = oneSignalService.isPushSupported();

    if (isPWA && isSupported) {
      try {
        await oneSignalService.init(user.id);
        const displayName = profile?.nickname || profile?.full_name || "Ukjent";
        await oneSignalService.enablePush(user.id, displayName);
      } catch (e) {
        console.warn("Push enable failed:", e);
      }
    }

    setLoading(false);
    if (!geo.enabled) {
      setStep("location");
    } else {
      setStep("camera");
    }
  };

  const handleLocation = () => {
    geo.request();
    setStep("camera");
  };

  const handleCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      stream.getTracks().forEach(t => t.stop());
    } catch {
      // User denied – that's ok
    }
    dismiss();
  };

  const skipStep = () => {
    if (step === "push") {
      if (!geo.enabled) setStep("location");
      else setStep("camera");
    } else if (step === "location") {
      setStep("camera");
    } else {
      dismiss();
    }
  };

  if (!visible || !user) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="w-full max-w-md bg-card border-t border-border rounded-t-2xl p-6 pb-safe animate-in slide-in-from-bottom duration-300" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()} onTouchStart={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-heading text-lg font-semibold text-foreground">
            {step === "push" ? "Aktiver varsler" : step === "location" ? "Del posisjon" : "Tillat kamera"}
          </h2>
          <button onClick={dismiss} className="p-1 text-muted-foreground">
            <X size={20} />
          </button>
        </div>

        {step === "push" && (
          <>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                <Bell className="h-6 w-6 text-primary" />
              </div>
              <p className="text-sm text-muted-foreground flex-1">
                Få beskjed når noen sender en melding i chatten eller når det skjer noe i Shot-spillet.
              </p>
            </div>
            <div className="flex gap-3">
              <DavosButton variant="outline" className="flex-1" onClick={skipStep} disabled={loading}>
                Senere
              </DavosButton>
              <DavosButton className="flex-1" onClick={handlePush} disabled={loading}>
                {loading ? "Aktiverer…" : "Aktiver"}
              </DavosButton>
            </div>
          </>
        )}

        {step === "location" && (
          <>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                <MapPin className="h-6 w-6 text-primary" />
              </div>
              <p className="text-sm text-muted-foreground flex-1">
                Del posisjonen din slik at vennene dine kan se hvor du er på kartet.
              </p>
            </div>
            <div className="flex gap-3">
              <DavosButton variant="outline" className="flex-1" onClick={skipStep}>
                Senere
              </DavosButton>
              <DavosButton className="flex-1" onClick={handleLocation}>
                Del posisjon
              </DavosButton>
            </div>
          </>
        )}

        {step === "camera" && (
          <>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                <Camera className="h-6 w-6 text-primary" />
              </div>
              <p className="text-sm text-muted-foreground flex-1">
                Gi tilgang til kamera og mikrofon for å ta bilder, legge ut stories og filme.
              </p>
            </div>
            <div className="flex gap-3">
              <DavosButton variant="outline" className="flex-1" onClick={dismiss}>
                Senere
              </DavosButton>
              <DavosButton className="flex-1" onClick={handleCamera}>
                Tillat kamera
              </DavosButton>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
