/**
 * SettingsScreen – Full settings page with profile, theme, notifications, info
 */

import * as React from "react";
import { useNavigate } from "react-router-dom";
import { AppHeader } from "@/components/layout/AppHeader";
import { BackButton } from "@/components/layout/BackButton";
import { PushNotificationToggle } from "@/components/settings/PushNotificationToggle";
import { GeolocationToggle } from "@/components/settings/GeolocationToggle";
import { supabase } from "@/integrations/supabase/client";
import { BrandCard, BrandCardContent } from "@/components/ui/brand-card";
import { BrandButton } from "@/components/ui/brand-button";
import { BrandInput } from "@/components/ui/brand-input";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/contexts/AuthContext";
import { AvatarUpload } from "@/components/settings/AvatarUpload";
import {
  Code2,
  Shield,
  FileText,
  Server,
  Database,
  Bell,
  Sparkles,
  Lock,
  Eye,
  Clock,
  MapPin,
  User,
  LogOut,
  Moon,
  Sun,
  Loader2,
  Check,
  KeyRound,
  Bug,
} from "lucide-react";
import { toast } from "sonner";
import { errorToast } from "@/utils/errorToast";

const APP_VERSION = "1.0.0-beta.1";

/** Inline password change – no email needed */
const ChangePasswordCard: React.FC = () => {
  const [newPw, setNewPw] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [open, setOpen] = React.useState(false);

  const handleChange = async () => {
    if (newPw.length < 6) {
      errorToast("Passord må være minst 6 tegn");
      return;
    }
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password: newPw });
    if (error) {
      errorToast("Kunne ikke endre passord", { description: error.message });
    } else {
      toast.success("Passord endret!");
      setNewPw("");
      setOpen(false);
    }
    setSaving(false);
  };

  return (
    <BrandCard>
      <BrandCardContent className="p-4">
        <div className="flex items-center gap-3 mb-3">
          <KeyRound className="h-5 w-5 text-primary" />
          <h2 className="font-heading font-semibold text-foreground">Passord</h2>
        </div>
        {!open ? (
          <BrandButton variant="outline" size="sm" className="w-full" onClick={() => setOpen(true)}>
            Endre passord
          </BrandButton>
        ) : (
          <div className="space-y-3">
            <BrandInput
              type="password"
              placeholder="Nytt passord (minst 6 tegn)"
              value={newPw}
              onChange={(e) => setNewPw(e.target.value)}
              autoComplete="new-password"
            />
            <div className="flex gap-2">
              <BrandButton variant="outline" size="sm" className="flex-1" onClick={() => { setOpen(false); setNewPw(""); }}>
                Avbryt
              </BrandButton>
              <BrandButton size="sm" className="flex-1" onClick={handleChange} disabled={saving || newPw.length < 6}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Lagre"}
              </BrandButton>
            </div>
          </div>
        )}
      </BrandCardContent>
    </BrandCard>
  );
};

export const SettingsScreen: React.FC = () => {
  const navigate = useNavigate();
  const { user, profile, signOut, updateProfile } = useAuth();

  // Profile editing state
  const [fullName, setFullName] = React.useState(profile?.full_name || "");
  const [nickname, setNickname] = React.useState(profile?.nickname || "");
  const [profileSaving, setProfileSaving] = React.useState(false);
  const profileDirty =
    fullName !== (profile?.full_name || "") ||
    nickname !== (profile?.nickname || "");

  React.useEffect(() => {
    setFullName(profile?.full_name || "");
    setNickname(profile?.nickname || "");
  }, [profile]);

  // Dark mode
  const [isDark, setIsDark] = React.useState(() => {
    if (typeof window === "undefined") return false;
    return document.documentElement.classList.contains("dark");
  });

  // Bug report
  const [bugText, setBugText] = React.useState("");
  const [bugSending, setBugSending] = React.useState(false);

  const toggleDarkMode = (checked: boolean) => {
    setIsDark(checked);
    if (checked) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("theme", "light");
    }
  };

  const handleSaveProfile = async () => {
    if (!fullName.trim() || !nickname.trim()) {
      errorToast("Navn og kallenavn er påkrevd");
      return;
    }
    setProfileSaving(true);
    const { error } = await updateProfile({
      full_name: fullName.trim(),
      nickname: nickname.trim(),
    });
    setProfileSaving(false);
    if (error) {
      errorToast("Kunne ikke oppdatere profil");
    } else {
      toast.success("Profil oppdatert");
    }
  };

  const handleBugReport = async () => {
    if (!bugText.trim() || !user) return;
    setBugSending(true);
    const { error } = await supabase.from("bug_reports").insert({
      user_id: user.id,
      message: bugText.trim(),
      page_url: window.location.href,
      user_agent: navigator.userAgent,
    });
    setBugSending(false);
    if (error) {
      errorToast("Kunne ikke sende rapport");
    } else {
      toast.success("Takk for tilbakemeldingen!");
      setBugText("");
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate("/auth");
  };

  return (
    <div
      className="flex flex-col overflow-hidden bg-background"
      style={{ height: "var(--app-height)" }}
    >
      <AppHeader
        title="Innstillinger"
        subtitle="Profil, varsler & info"
        leftAction={<BackButton fallbackPath="/hjem" />}
      />

      <div
        className="flex-1 overflow-y-auto overscroll-contain"
        style={{
          paddingBottom: "var(--bottom-nav-h-effective)",
          WebkitOverflowScrolling: "touch",
        }}
      >
        <div className="p-4 space-y-4">
          {/* Profile */}
          <BrandCard>
            <BrandCardContent className="p-4">
              <div className="flex items-center gap-3 mb-3">
                <User className="h-5 w-5 text-primary" />
                <h2 className="font-heading font-semibold text-foreground">
                  Profil
                </h2>
              </div>
              <div className="space-y-3">
                <AvatarUpload />
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Fullt navn</label>
                  <BrandInput
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Fullt navn"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Kallenavn</label>
                  <BrandInput
                    value={nickname}
                    onChange={(e) => setNickname(e.target.value)}
                    placeholder="Kallenavn (vises i chat)"
                  />
                </div>
                {user && (
                  <p className="text-xs text-muted-foreground">
                    E-post: {user.email}
                  </p>
                )}
                {profileDirty && (
                  <BrandButton
                    onClick={handleSaveProfile}
                    disabled={profileSaving}
                    className="w-full"
                    size="sm"
                  >
                    {profileSaving ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Check className="h-4 w-4 mr-2" />
                    )}
                    Lagre endringer
                  </BrandButton>
                )}
              </div>
            </BrandCardContent>
          </BrandCard>

          {/* Dark mode */}
          <BrandCard>
            <BrandCardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {isDark ? (
                    <Moon className="h-5 w-5 text-primary" />
                  ) : (
                    <Sun className="h-5 w-5 text-primary" />
                  )}
                  <div>
                    <h2 className="font-heading font-semibold text-foreground">
                      Utseende
                    </h2>
                    <p className="text-xs text-muted-foreground">
                      {isDark ? "Mørk modus" : "Lys modus"}
                    </p>
                  </div>
                </div>
                <Switch checked={isDark} onCheckedChange={toggleDarkMode} />
              </div>
            </BrandCardContent>
          </BrandCard>

          {/* Push notifications */}
          <BrandCard>
            <BrandCardContent className="p-4">
              <div className="flex items-center gap-3 mb-3">
                <Bell className="h-5 w-5 text-primary" />
                <h2 className="font-heading font-semibold text-foreground">
                  Push-varsler
                </h2>
              </div>
              <PushNotificationToggle />
            </BrandCardContent>
          </BrandCard>

          {/* Geolocation */}
          <BrandCard>
            <BrandCardContent className="p-4">
              <div className="flex items-center gap-3 mb-3">
                <MapPin className="h-5 w-5 text-primary" />
                <h2 className="font-heading font-semibold text-foreground">
                  Posisjon
                </h2>
              </div>
              <GeolocationToggle />
            </BrandCardContent>
          </BrandCard>

          {/* Tech stack */}
          <BrandCard>
            <BrandCardContent className="p-4">
              <div className="flex items-center gap-3 mb-3">
                <Code2 className="h-5 w-5 text-primary" />
                <h2 className="font-heading font-semibold text-foreground">
                  Teknisk stack
                </h2>
              </div>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="flex items-center gap-2">
                  <Server className="h-4 w-4" />
                  <span><strong>Frontend:</strong> React + TypeScript + Vite</span>
                </li>
                <li className="flex items-center gap-2">
                  <Database className="h-4 w-4" />
                  <span><strong>Backend:</strong> Lovable Cloud</span>
                </li>
                <li className="flex items-center gap-2">
                  <Bell className="h-4 w-4" />
                  <span><strong>Push:</strong> OneSignal</span>
                </li>
                <li className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4" />
                  <span><strong>AI:</strong> OpenAI GPT-5.2 via Lovable AI</span>
                </li>
              </ul>
            </BrandCardContent>
          </BrandCard>

          {/* Security */}
          <BrandCard>
            <BrandCardContent className="p-4">
              <div className="flex items-center gap-3 mb-3">
                <Shield className="h-5 w-5 text-secondary" />
                <h2 className="font-heading font-semibold text-foreground">
                  Sikkerhet
                </h2>
              </div>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="flex items-start gap-2">
                  <Lock className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <span><strong>RLS:</strong> All data er beskyttet på database-nivå.</span>
                </li>
                <li className="flex items-start gap-2">
                  <Eye className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <span><strong>Privat lagring:</strong> Kryptert med signerte URLs.</span>
                </li>
                <li className="flex items-start gap-2">
                  <Clock className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <span><strong>Rate limiting:</strong> Beskyttelse mot misbruk.</span>
                </li>
              </ul>
            </BrandCardContent>
          </BrandCard>

          {/* Terms */}
          <BrandCard>
            <BrandCardContent className="p-4">
              <div className="flex items-center gap-3 mb-3">
                <FileText className="h-5 w-5 text-accent" />
                <h2 className="font-heading font-semibold text-foreground">
                  Om appen & vilkår
                </h2>
              </div>
              <div className="text-sm text-muted-foreground space-y-3">
                <p className="font-medium text-foreground">Ansvarsfraskrivelse</p>
                <p>
                  GüttaHütte er et <strong>privat hobbyprosjekt</strong> laget for moro skyld.
                  Appen leveres «som den er» uten noen form for garanti.
                </p>
                <ul className="list-disc pl-4 space-y-1 text-xs">
                  <li>Utvikler har <strong>intet ansvar</strong> for innhold postet av brukere</li>
                  <li>Utvikler har <strong>intet ansvar</strong> for handlinger eller konsekvenser som følge av bruk</li>
                  <li>All bruk skjer <strong>på eget ansvar</strong> og frivillig</li>
                  <li>Data kan gå tapt uten forvarsel – det gis ingen garanti for oppetid eller lagring</li>
                  <li>Admin kan slette kontoer og innhold etter eget skjønn</li>
                  <li>Ved å bruke appen aksepterer du disse vilkårene</li>
                </ul>
                <div className="border-t border-border pt-3 mt-3 space-y-1">
                  <p><strong>Tilgang:</strong> Kun ved invitasjon.</p>
                  <p><strong>Personvern:</strong> Data lagres i appens sikrede backend. Du kan be om sletting når som helst.</p>
                  <p><strong>Kontakt:</strong> Bruk «Rapporter feil»-funksjonen nedenfor, eller kontakt admin direkte.</p>
                </div>
              </div>
            </BrandCardContent>
          </BrandCard>

          {/* Change password */}
          <ChangePasswordCard />

          {/* Bug report */}
          <BrandCard>
            <BrandCardContent className="p-4">
              <div className="flex items-center gap-3 mb-3">
                <Bug className="h-5 w-5 text-primary" />
                <h2 className="font-heading font-semibold text-foreground">
                  Rapporter feil
                </h2>
              </div>
              <textarea
                className="w-full rounded-lg border border-border bg-background p-3 text-sm text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
                rows={3}
                placeholder="Beskriv feilen du opplevde..."
                value={bugText}
                onChange={e => setBugText(e.target.value)}
              />
              <BrandButton
                onClick={handleBugReport}
                disabled={bugSending || !bugText.trim()}
                size="sm"
                className="w-full mt-2"
              >
                {bugSending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Bug className="h-4 w-4 mr-2" />}
                Send rapport
              </BrandButton>
            </BrandCardContent>
          </BrandCard>

          {/* Sign out */}
          <BrandButton
            variant="outline"
            onClick={handleSignOut}
            className="w-full text-destructive border-destructive/30"
          >
            <LogOut className="h-4 w-4 mr-2" />
            Logg ut
          </BrandButton>

          <p className="text-center text-xs text-muted-foreground py-4">
            GüttaHütte {APP_VERSION} · Bygget med ❤️ for Gütta
          </p>
        </div>
      </div>
    </div>
  );
};

export default SettingsScreen;
