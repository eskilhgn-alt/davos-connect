/**
 * InfoScreen - App info, stack, security, and terms
 */

import * as React from "react";
import { useNavigate } from "react-router-dom";
import { AppHeader } from "@/components/layout/AppHeader";
import { BackButton } from "@/components/layout/BackButton";
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
  ArrowLeft
} from "lucide-react";

interface InfoSection {
  icon: React.ReactNode;
  title: string;
  content: React.ReactNode;
}

export const InfoScreen: React.FC = () => {
  const navigate = useNavigate();

  const sections: InfoSection[] = [
    {
      icon: <Code2 className="h-5 w-5 text-primary" />,
      title: "Teknisk stack",
      content: (
        <ul className="space-y-2 text-sm text-muted-foreground">
          <li className="flex items-center gap-2">
            <Server className="h-4 w-4" />
            <span><strong>Frontend:</strong> React + TypeScript + Vite</span>
          </li>
          <li className="flex items-center gap-2">
            <Database className="h-4 w-4" />
            <span><strong>Backend:</strong> Lovable Cloud (Supabase)</span>
          </li>
          <li className="flex items-center gap-2">
            <Bell className="h-4 w-4" />
            <span><strong>Push:</strong> OneSignal</span>
          </li>
          <li className="flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            <span><strong>AI:</strong> OpenAI GPT-4o-mini</span>
          </li>
        </ul>
      ),
    },
    {
      icon: <Shield className="h-5 w-5 text-secondary" />,
      title: "Sikkerhet",
      content: (
        <ul className="space-y-2 text-sm text-muted-foreground">
          <li className="flex items-start gap-2">
            <Lock className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <span>
              <strong>Row Level Security (RLS):</strong> All data er beskyttet på database-nivå. Du kan kun se og endre dine egne data.
            </span>
          </li>
          <li className="flex items-start gap-2">
            <Eye className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <span>
              <strong>Privat lagring:</strong> Bilder og filer lagres kryptert med signerte URLs.
            </span>
          </li>
          <li className="flex items-start gap-2">
            <Clock className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <span>
              <strong>Rate limiting:</strong> Backend-funksjoner har beskyttelse mot misbruk.
            </span>
          </li>
          <li className="flex items-start gap-2">
            <Server className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <span>
              <strong>Secrets:</strong> Alle API-nøkler er kun tilgjengelig server-side.
            </span>
          </li>
        </ul>
      ),
    },
    {
      icon: <FileText className="h-5 w-5 text-accent" />,
      title: "Brukervilkår",
      content: (
        <div className="text-sm text-muted-foreground space-y-3">
          <p>
            <strong>Privat gruppe-app:</strong> Dette er en privat app for en lukket gruppe. 
            Tilgang gis kun ved invitasjon.
          </p>
          <p>
            <strong>Innhold:</strong> Du er ansvarlig for innhold du deler. 
            Upassende innhold kan føre til utestengelse.
          </p>
          <p>
            <strong>Personvern:</strong> Vi samler kun nødvendige data for appens funksjonalitet:
          </p>
          <ul className="list-disc list-inside ml-2 space-y-1">
            <li>E-post og navn (for profil og pålogging)</li>
            <li>Meldinger og bilder du deler i chat</li>
            <li>Push-token for varsler (valgfritt)</li>
          </ul>
          <p>
            <strong>Datalagring:</strong> Data lagres i Europa (EU/Sveits). 
            Du kan be om sletting av dine data når som helst.
          </p>
          <p>
            <strong>Ingen garanti:</strong> Appen leveres "som den er" uten garantier. 
            Værdata er aggregert fra flere kilder og kan inneholde unøyaktigheter.
          </p>
        </div>
      ),
    },
  ];

  return (
    <div 
      className="flex flex-col overflow-hidden bg-background"
      style={{ height: "var(--app-height)" }}
    >
      <AppHeader 
        title="Info" 
        subtitle="Om appen"
        leftAction={<BackButton fallbackPath="/hjem" />}
      />

      <div 
        className="flex-1 overflow-y-auto overscroll-contain"
        style={{ 
          paddingBottom: "var(--bottom-nav-h-effective)",
          WebkitOverflowScrolling: 'touch'
        }}
      >
        <div className="p-4 space-y-4">
          {sections.map((section, index) => (
            <DavosCard key={index}>
              <DavosCardContent className="p-4">
                <div className="flex items-center gap-3 mb-3">
                  {section.icon}
                  <h2 className="font-heading font-semibold text-foreground">
                    {section.title}
                  </h2>
                </div>
                {section.content}
              </DavosCardContent>
            </DavosCard>
          ))}

          {/* Version footer */}
          <p className="text-center text-xs text-muted-foreground py-4">
            Glühwein v1.0 · Bygget med ❤️ for crewet
          </p>
        </div>
      </div>
    </div>
  );
};

export default InfoScreen;
