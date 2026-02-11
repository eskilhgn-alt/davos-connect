/**
 * VerifyEmailScreen – handles email verification callback
 */
import * as React from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, CheckCircle, XCircle } from "lucide-react";
import { DavosButton } from "@/components/ui/davos-button";

export const VerifyEmailScreen: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get("token");

  const [status, setStatus] = React.useState<"loading" | "success" | "error">("loading");
  const [errorMsg, setErrorMsg] = React.useState("");

  React.useEffect(() => {
    if (!token) {
      setStatus("error");
      setErrorMsg("Ingen bekreftelsestoken funnet");
      return;
    }

    supabase.functions
      .invoke("verify-email", { body: { token } })
      .then(({ data, error }) => {
        if (error || data?.error) {
          setStatus("error");
          setErrorMsg(data?.error || error?.message || "Bekreftelse feilet");
        } else {
          setStatus("success");
        }
      });
  }, [token]);

  return (
    <div
      className="flex flex-col bg-background items-center justify-center px-6"
      style={{ minHeight: "var(--app-height, 100dvh)" }}
    >
      <div className="w-full max-w-sm text-center space-y-6">
        <h1 className="font-heading text-3xl font-bold tracking-tight">GüttaHütte</h1>

        {status === "loading" && (
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <p className="text-muted-foreground">Bekrefter e-post...</p>
          </div>
        )}

        {status === "success" && (
          <div className="flex flex-col items-center gap-4">
            <CheckCircle className="h-12 w-12 text-green-500" />
            <h2 className="font-heading text-xl font-semibold">E-post bekreftet!</h2>
            <p className="text-sm text-muted-foreground">Du kan nå logge inn og bruke appen.</p>
            <DavosButton onClick={() => navigate("/auth")} className="w-full">
              Gå til innlogging
            </DavosButton>
          </div>
        )}

        {status === "error" && (
          <div className="flex flex-col items-center gap-4">
            <XCircle className="h-12 w-12 text-destructive" />
            <h2 className="font-heading text-xl font-semibold">Bekreftelse feilet</h2>
            <p className="text-sm text-muted-foreground">{errorMsg}</p>
            <DavosButton onClick={() => navigate("/auth")} className="w-full">
              Tilbake til innlogging
            </DavosButton>
          </div>
        )}
      </div>
    </div>
  );
};

export default VerifyEmailScreen;
