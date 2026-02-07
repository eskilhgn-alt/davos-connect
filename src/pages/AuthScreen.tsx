/**
 * AuthScreen – Minimal auth UI
 */

import * as React from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { DavosButton } from "@/components/ui/davos-button";
import { DavosInput } from "@/components/ui/davos-input";
import { ArrowLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";

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

  React.useEffect(() => {
    if (user && profile?.full_name && profile?.nickname) {
      navigate("/");
    } else if (user && (!profile?.full_name || !profile?.nickname)) {
      setMode("onboarding");
    }
  }, [user, profile, navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    const { error } = await signIn(email, password);
    if (error) toast.error(error.message);
    else toast.success("Logget inn!");
    setIsSubmitting(false);
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    const { error } = await signUp(email, password);
    if (error) toast.error(error.message);
    else { toast.success("Sjekk e-posten din for bekreftelseslenke!"); setMode("login"); }
    setIsSubmitting(false);
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    const { error } = await resetPassword(email);
    if (error) toast.error(error.message);
    else { toast.success("Sjekk e-posten din!"); setMode("login"); }
    setIsSubmitting(false);
  };

  const handleOnboarding = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    const { error } = await updateProfile({
      full_name: fullName.trim(),
      nickname: nickname.trim() || fullName.split(" ")[0],
    });
    if (error) toast.error(error.message);
    else { toast.success("Profil oppdatert!"); navigate("/"); }
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
      {/* Minimal header */}
      <header className="flex items-center justify-center py-16 px-6">
        <div className="text-center">
          <h1 className="font-heading text-3xl font-bold text-foreground tracking-tight">
            Glühwein
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Privat gruppe-app
          </p>
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

              <DavosButton type="submit" className="w-full" disabled={isSubmitting}>
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
                <ArrowLeft size={16} />
                Tilbake
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
              <div className="mb-8">
                <h2 className="font-heading text-xl font-semibold">Fullfør profilen</h2>
                <p className="text-sm text-muted-foreground mt-1">Hvem er du i crewet?</p>
              </div>

              <DavosInput type="text" placeholder="Fullt navn" value={fullName} onChange={(e) => setFullName(e.target.value)} required autoComplete="name" />
              <DavosInput type="text" placeholder="Kallenavn" value={nickname} onChange={(e) => setNickname(e.target.value)} autoComplete="nickname" />

              <p className="text-xs text-muted-foreground">Kallenavnet brukes i chat. Tomt = fornavn.</p>

              <DavosButton type="submit" className="w-full" disabled={isSubmitting || !fullName.trim()}>
                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Kom i gang"}
              </DavosButton>
            </form>
          )}
        </div>
      </main>
    </div>
  );
};

export default AuthScreen;
