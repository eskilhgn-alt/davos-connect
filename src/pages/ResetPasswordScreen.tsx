/**
 * ResetPasswordScreen - Handles password reset from email link
 */

import * as React from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { BrandButton } from "@/components/ui/brand-button";
import { BrandInput } from "@/components/ui/brand-input";
import { Loader2, CheckCircle } from "lucide-react";
import { toast } from "sonner";
import { errorToast } from "@/utils/errorToast";

export const ResetPasswordScreen: React.FC = () => {
  const navigate = useNavigate();
  const [password, setPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [success, setSuccess] = React.useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password.length < 6) {
      errorToast("Passordet må være minst 6 tegn");
      return;
    }

    if (password !== confirmPassword) {
      errorToast("Passordene stemmer ikke overens");
      return;
    }

    setIsSubmitting(true);
    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      errorToast("Kunne ikke oppdatere passord", { description: error.message });
    } else {
      setSuccess(true);
      toast.success("Passordet er oppdatert!");
      setTimeout(() => navigate("/hjem"), 2000);
    }
    setIsSubmitting(false);
  };

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
          <p className="text-sm text-muted-foreground mt-1">
            Tilbakestill passord
          </p>
        </div>
      </header>

      <main className="flex-1 flex items-start justify-center px-6 pb-8">
        <div className="w-full max-w-sm">
          {success ? (
            <div className="flex flex-col items-center gap-4 text-center">
              <CheckCircle className="h-12 w-12 text-green-500" />
              <h2 className="font-heading text-xl font-semibold">Passordet er oppdatert!</h2>
              <p className="text-sm text-muted-foreground">Du sendes til hjemskjermen...</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="mb-8">
                <h2 className="font-heading text-xl font-semibold">Nytt passord</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Velg et nytt passord for kontoen din
                </p>
              </div>

              <BrandInput
                type="password"
                placeholder="Nytt passord (minst 6 tegn)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                autoComplete="new-password"
              />
              <BrandInput
                type="password"
                placeholder="Bekreft passord"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={6}
                autoComplete="new-password"
              />

              <BrandButton type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Oppdater passord"
                )}
              </BrandButton>
            </form>
          )}
        </div>
      </main>
    </div>
  );
};

export default ResetPasswordScreen;
