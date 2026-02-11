/**
 * AuthScreen – Auth UI with mandatory avatar on onboarding
 */

import * as React from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { DavosButton } from "@/components/ui/davos-button";
import { DavosInput } from "@/components/ui/davos-input";
import { DavosAvatar } from "@/components/ui/davos-avatar";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Loader2, Camera, Check } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { errorToast } from "@/utils/errorToast";

const WELCOME_THREAD_ID = "00000000-0000-0000-0000-000000000001";

/** Fire-and-forget welcome message in chat */
function sendWelcomeMessage(displayName: string) {
  supabase.from("messages").insert({
    text: `${displayName} har blitt med i GüttaHütte! 🏔️ Velkommen!`,
    thread_id: WELCOME_THREAD_ID,
    sender_id: "system",
    sender_name: "GüttaHütte",
  }).then(({ error }) => {
    if (error) console.warn("Welcome message failed:", error);
  });
}

type AuthMode = "login" | "signup" | "forgot" | "onboarding";

export const AuthScreen: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, profile, signIn, signUp, resetPassword, updateProfile, isLoading } = useAuth();
  
  const [mode, setMode] = React.useState<AuthMode>(
    searchParams.get("mode") === "signup" ? "signup" : "login"
  );
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [fullName, setFullName] = React.useState("");
  const [nickname, setNickname] = React.useState("");
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [disclaimerAccepted, setDisclaimerAccepted] = React.useState(false);

  // Avatar upload state for onboarding
  const [avatarFile, setAvatarFile] = React.useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = React.useState<string | null>(null);
  const [avatarUploading, setAvatarUploading] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (user && profile?.full_name && profile?.nickname && profile?.avatar_url) {
      navigate("/");
    } else if (user && (!profile?.full_name || !profile?.nickname || !profile?.avatar_url)) {
      setMode("onboarding");
    }
  }, [user, profile, navigate]);

  // Clean up preview URL
  React.useEffect(() => {
    return () => {
      if (avatarPreview) URL.revokeObjectURL(avatarPreview);
    };
  }, [avatarPreview]);

  const handleAvatarSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      errorToast("Kun bilder er tillatt");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      errorToast("Maks 5 MB");
      return;
    }
    if (avatarPreview) URL.revokeObjectURL(avatarPreview);
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    const { error } = await signIn(email, password);
    if (error) errorToast("Innlogging feilet", { description: error.message });
    else toast.success("Logget inn!");
    setIsSubmitting(false);
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    const { error } = await signUp(email, password);
    if (error) errorToast("Registrering feilet", { description: error.message });
    else { toast.success("Konto opprettet!"); }
    setIsSubmitting(false);
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    const { error } = await resetPassword(email);
    if (error) errorToast("Tilbakestilling feilet", { description: error.message });
    else { toast.success("Sjekk e-posten din!"); setMode("login"); }
    setIsSubmitting(false);
  };

  const handleOnboarding = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!avatarFile && !profile?.avatar_url) {
      errorToast("Du må legge til et profilbilde");
      return;
    }
    setIsSubmitting(true);

    let avatarUrl = profile?.avatar_url || null;

    // Upload avatar if new file selected
    if (avatarFile && user) {
      setAvatarUploading(true);
      try {
        const ext = avatarFile.name.split(".").pop() || "jpg";
        const path = `${user.id}/avatar.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from("avatars")
          .upload(path, avatarFile, { upsert: true });
        if (uploadError) throw uploadError;
        const { data } = supabase.storage.from("avatars").getPublicUrl(path);
        avatarUrl = `${data.publicUrl}?t=${Date.now()}`;
      } catch (err: any) {
        errorToast("Kunne ikke laste opp bilde");
        setIsSubmitting(false);
        setAvatarUploading(false);
        return;
      }
      setAvatarUploading(false);
    }

    const { error } = await updateProfile({
      full_name: fullName.trim(),
      nickname: nickname.trim() || fullName.split(" ")[0],
      avatar_url: avatarUrl,
    });
    if (error) {
      errorToast("Profiloppdatering feilet", { description: error.message });
    } else {
      toast.success("Profil klar!");
      // Send welcome message in chat
      sendWelcomeMessage(nickname.trim() || fullName.split(" ")[0]);
      navigate("/");
    }
    setIsSubmitting(false);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div 
      className="flex flex-col bg-background"
      style={{ minHeight: "var(--app-height, 100dvh)" }}
    >
      <header className="flex items-center justify-center py-16 px-6">
        <div className="text-center">
          <h1 className="font-heading text-3xl font-bold text-foreground tracking-tight">
            GüttaHütte
          </h1>
        </div>
      </header>

      <main className="flex-1 flex items-start justify-center px-6 pb-8">
        <div className="w-full max-w-sm">
          {mode === "login" && (
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="mb-8">
                <h2 className="font-heading text-xl font-semibold">Logg inn</h2>
              </div>
              <DavosInput type="email" placeholder="E-post" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
              <DavosInput type="password" placeholder="Passord" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
              <DavosButton type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Logg inn"}
              </DavosButton>
              <div className="flex flex-col gap-2 text-center text-sm pt-2">
                <button type="button" onClick={() => setMode("forgot")} className="text-muted-foreground hover:text-foreground transition-colors">
                  Glemt passord?
                </button>
                <p className="text-muted-foreground">
                  Ny bruker?{" "}
                  <button type="button" onClick={() => setMode("signup")} className="text-foreground font-medium hover:underline">
                    Opprett konto
                  </button>
                </p>
              </div>
            </form>
          )}

          {mode === "signup" && (
            <form onSubmit={handleSignup} className="space-y-4">
              <div className="mb-8">
                <h2 className="font-heading text-xl font-semibold">Opprett konto</h2>
              </div>
              <DavosInput type="email" placeholder="E-post" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
              <DavosInput type="password" placeholder="Passord (minst 6 tegn)" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} autoComplete="new-password" />
              
              <label className="flex items-start gap-3 cursor-pointer py-2">
                <Checkbox
                  checked={disclaimerAccepted}
                  onCheckedChange={(v) => setDisclaimerAccepted(v === true)}
                  className="mt-0.5"
                />
                <span className="text-xs text-muted-foreground leading-relaxed">
                  Jeg forstår at denne appen brukes på eget ansvar. Utvikler tar ikke ansvar for innhold, handlinger eller konsekvenser som følge av bruk. Ved å opprette konto aksepterer du dette.
                </span>
              </label>

              <DavosButton type="submit" className="w-full" disabled={isSubmitting || !disclaimerAccepted}>
                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Opprett konto"}
              </DavosButton>
              <p className="text-center text-sm text-muted-foreground">
                Har du konto?{" "}
                <button type="button" onClick={() => setMode("login")} className="text-foreground font-medium hover:underline">
                  Logg inn
                </button>
              </p>
            </form>
          )}

          {mode === "forgot" && (
            <form onSubmit={handleForgotPassword} className="space-y-4">
              <button type="button" onClick={() => setMode("login")} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
                <ArrowLeft size={16} /> Tilbake
              </button>
              <div className="mb-8">
                <h2 className="font-heading text-xl font-semibold">Glemt passord?</h2>
                <p className="text-sm text-muted-foreground mt-1">Vi sender deg en tilbakestillingslenke</p>
              </div>
              <DavosInput type="email" placeholder="E-post" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
              <DavosButton type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send lenke"}
              </DavosButton>
            </form>
          )}

          {mode === "onboarding" && (
            <form onSubmit={handleOnboarding} className="space-y-4">
              <div className="mb-6">
                <h2 className="font-heading text-xl font-semibold">Fullfør profilen</h2>
                <p className="text-sm text-muted-foreground mt-1">Hvem er du av Gütta?</p>
              </div>

              {/* Avatar upload */}
              <div className="flex flex-col items-center gap-3">
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="relative group"
                >
                  <DavosAvatar
                    src={avatarPreview || profile?.avatar_url || undefined}
                    fallback={fullName || "?"}
                    size="xl"
                  />
                  <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 opacity-0 group-hover:opacity-100 group-active:opacity-100 transition-opacity">
                    <Camera className="h-6 w-6 text-white" />
                  </div>
                </button>
                <p className="text-xs text-muted-foreground">
                  {avatarFile ? "✓ Bilde valgt" : "Trykk for å legge til profilbilde *"}
                </p>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  capture="user"
                  onChange={handleAvatarSelect}
                  className="hidden"
                />
              </div>

              <DavosInput type="text" placeholder="Fullt navn" value={fullName} onChange={(e) => setFullName(e.target.value)} required autoComplete="name" />
              <DavosInput type="text" placeholder="Kallenavn" value={nickname} onChange={(e) => setNickname(e.target.value)} autoComplete="nickname" />
              <p className="text-xs text-muted-foreground">Kallenavnet brukes i chat. Tomt = fornavn.</p>

              <DavosButton type="submit" className="w-full" disabled={isSubmitting || !fullName.trim()}>
                {isSubmitting || avatarUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Kom i gang"}
              </DavosButton>
            </form>
          )}
        </div>
      </main>
    </div>
  );
};

export default AuthScreen;
