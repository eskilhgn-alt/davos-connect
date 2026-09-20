/**
 * Global Error Boundary - Prevents white screen crashes
 */

import * as React from "react";
import { BrandButton } from "@/components/ui/brand-button";
import { AppHeader } from "@/components/layout/AppHeader";
import { AlertTriangle } from "lucide-react";

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("ErrorBoundary caught:", error, info.componentStack);
  }

  handleReset = () => {
    window.location.href = "/hjem";
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="h-full min-h-0 flex flex-col bg-background">
          <AppHeader title="Noe gikk galt" onHome={this.handleReset} />
          <div className="flex-1 flex items-center justify-center p-6">
            <div className="text-center max-w-sm space-y-4">
              <AlertTriangle className="h-12 w-12 text-destructive mx-auto" />
              <h2 className="font-heading text-xl font-bold text-foreground">
                Noe gikk galt
              </h2>
              <p className="text-sm text-muted-foreground">
                En uventet feil oppstod. Prøv å laste siden på nytt.
              </p>
              <BrandButton onClick={() => window.location.reload()} className="w-full">
                Last inn på nytt
              </BrandButton>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
