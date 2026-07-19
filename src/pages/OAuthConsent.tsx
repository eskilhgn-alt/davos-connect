/**
 * OAuth Consent Screen — routed at /.lovable/oauth/consent
 * Lets en ekstern MCP-klient (ChatGPT, Claude, Cursor, ...) få tilgang som denne brukeren.
 */
import * as React from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { DavosButton } from "@/components/ui/davos-button";
import { Loader2, ShieldCheck } from "lucide-react";

// Beta-namespace — lokal type-wrapper så TS ikke klager.
type OAuthApi = {
  getAuthorizationDetails: (id: string) => Promise<{ data: any; error: { message: string } | null }>;
  approveAuthorization: (id: string) => Promise<{ data: any; error: { message: string } | null }>;
  denyAuthorization: (id: string) => Promise<{ data: any; error: { message: string } | null }>;
};

const oauth = (supabase.auth as unknown as { oauth: OAuthApi }).oauth;

export const OAuthConsent: React.FC = () => {
  const [params] = useSearchParams();
  const authorizationId = params.get("authorization_id") ?? "";
  const { user, profile, isLoading } = useAuth();
  const [details, setDetails] = React.useState<any>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    let active = true;
    (async () => {
      if (!authorizationId) {
        setError("Manglende authorization_id");
        return;
      }
      if (isLoading) return;
      if (!user) {
        const next = window.location.pathname + window.location.search;
        window.location.href = "/auth?next=" + encodeURIComponent(next);
        return;
      }
      if (!oauth) {
        setError("OAuth-server er ikke aktivert.");
        return;
      }
      const { data, error } = await oauth.getAuthorizationDetails(authorizationId);
      if (!active) return;
      if (error) return setError(error.message);
      const immediate = data?.redirect_url ?? data?.redirect_to;
      if (immediate && !data?.client) {
        window.location.href = immediate;
        return;
      }
      setDetails(data);
    })();
    return () => {
      active = false;
    };
  }, [authorizationId, user, isLoading]);

  const decide = async (approve: boolean) => {
    setBusy(true);
    const { data, error } = approve
      ? await oauth.approveAuthorization(authorizationId)
      : await oauth.denyAuthorization(authorizationId);
    if (error) {
      setBusy(false);
      setError(error.message);
      return;
    }
    const target = data?.redirect_url ?? data?.redirect_to;
    if (!target) {
      setBusy(false);
      setError("Ingen redirect returnert fra auth-serveren.");
      return;
    }
    window.location.href = target;
  };

  if (error) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center p-6 bg-background text-center gap-4">
        <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center">
          <span className="text-3xl">⚠️</span>
        </div>
        <h1 className="font-heading text-xl font-bold text-foreground">Kunne ikke laste forespørsel</h1>
        <p className="text-sm text-muted-foreground max-w-sm">{error}</p>
      </main>
    );
  }

  if (isLoading || !details) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </main>
    );
  }

  const clientName = details.client?.name ?? details.client?.client_name ?? "En ekstern app";
  const scopes: string[] = Array.isArray(details.scopes)
    ? details.scopes
    : typeof details.scope === "string"
    ? details.scope.split(" ").filter(Boolean)
    : [];

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6 bg-background">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-2">
          <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
            <ShieldCheck className="h-7 w-7 text-primary" />
          </div>
          <h1 className="font-heading text-xl font-bold text-foreground">
            Koble {clientName} til GüttaHütte
          </h1>
          <p className="text-sm text-muted-foreground">
            {clientName} vil kunne bruke GüttaHütte-verktøyene som deg.
          </p>
        </div>

        <div className="bg-muted/50 rounded-xl p-4 space-y-2 text-left">
          <p className="text-xs text-muted-foreground">Innlogget som</p>
          <p className="text-sm text-foreground font-medium">
            {profile?.nickname || profile?.full_name || user?.email}
          </p>
          {scopes.length > 0 && (
            <>
              <p className="text-xs text-muted-foreground pt-2">Forespurt tilgang</p>
              <ul className="text-xs text-foreground list-disc pl-4 space-y-0.5">
                {scopes.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            </>
          )}
          <p className="text-[11px] text-muted-foreground pt-2 leading-relaxed">
            Tilgang følger dine vanlige rettigheter i appen (RLS). Du kan trekke tilgangen når som helst.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <DavosButton onClick={() => decide(true)} disabled={busy} className="w-full">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Godkjenn"}
          </DavosButton>
          <button
            type="button"
            onClick={() => decide(false)}
            disabled={busy}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors py-2"
          >
            Avslå
          </button>
        </div>
      </div>
    </main>
  );
};

export default OAuthConsent;
