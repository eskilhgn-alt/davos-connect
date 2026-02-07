/**
 * SettingsScreen – Merged Varsler + Info into one settings page
 */

import * as React from "react";
import { AppHeader } from "@/components/layout/AppHeader";
import { BackButton } from "@/components/layout/BackButton";
import { PushNotificationToggle } from "@/components/settings/PushNotificationToggle";
import { DavosCard, DavosCardContent } from "@/components/ui/davos-card";
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
} from "lucide-react";

export const SettingsScreen: React.FC = () => {
  return (
    <div
      className="flex flex-col overflow-hidden bg-background"
      style={{ height: "var(--app-height)" }}
    >
      <AppHeader
        title="Innstillinger"
        subtitle="Varsler & info"
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
          {/* Push notifications */}
          <DavosCard>
            <DavosCardContent className="p-4">
              <div className="flex items-center gap-3 mb-3">
                <Bell className="h-5 w-5 text-primary" />
                <h2 className="font-heading font-semibold text-foreground">
                  Push-varsler
                </h2>
              </div>
              <PushNotificationToggle />
            </DavosCardContent>
          </DavosCard>

          {/* Tech stack */}
          <DavosCard>
            <DavosCardContent className="p-4">
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
                  <span><strong>AI:</strong> Gemini</span>
                </li>
              </ul>
            </DavosCardContent>
          </DavosCard>

          {/* Security */}
          <DavosCard>
            <DavosCardContent className="p-4">
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
            </DavosCardContent>
          </DavosCard>

          {/* Terms */}
          <DavosCard>
            <DavosCardContent className="p-4">
              <div className="flex items-center gap-3 mb-3">
                <FileText className="h-5 w-5 text-accent" />
                <h2 className="font-heading font-semibold text-foreground">
                  Brukervilkår
                </h2>
              </div>
              <div className="text-sm text-muted-foreground space-y-3">
                <p><strong>Privat gruppe-app:</strong> Tilgang kun ved invitasjon.</p>
                <p><strong>Personvern:</strong> Data lagres i Europa (EU/Sveits). Du kan be om sletting når som helst.</p>
                <p><strong>Ingen garanti:</strong> Appen leveres "som den er".</p>
              </div>
            </DavosCardContent>
          </DavosCard>

          <p className="text-center text-xs text-muted-foreground py-4">
            Glühwein v1.0 · Bygget med ❤️ for crewet
          </p>
        </div>
      </div>
    </div>
  );
};

export default SettingsScreen;
