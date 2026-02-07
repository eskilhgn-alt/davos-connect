/**
 * Global Error Boundary - Prevents white screen crashes
 */

import * as React from "react";
import { DavosButton } from "@/components/ui/davos-button";
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
    this.setState({ hasError: false, error: undefined });
    window.location.href = "/hjem";
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background p-6">
          <div className="text-center max-w-sm space-y-4">
            <AlertTriangle className="h-12 w-12 text-destructive mx-auto" />
            <h1 className="font-heading text-xl font-bold text-foreground">
              Noe gikk galt
            </h1>
            <p className="text-sm text-muted-foreground">
              En uventet feil oppstod. Prøv å laste siden på nytt.
            </p>
            <DavosButton onClick={this.handleReset} className="w-full">
              Tilbake til hjem
            </DavosButton>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
