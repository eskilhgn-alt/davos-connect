import React from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { tripAdminActions } from "@/features/trip/tripAdminActions";

vi.mock("@/contexts/TripContext", () => ({ useTrip: () => ({
  trips: ["draft", "active", "archived"].map(status => ({
    id: status, name: `Tur ${status}`, destination: "Val Thorens", status,
    destination_config: {}, timezone: "Europe/Paris", currency: "EUR",
    start_date: null, end_date: null,
  })), activeTrip: { id: "active" }, isLoading: false, reloadTrips: vi.fn(), applySavedTrip: vi.fn(),
}) }));
import { AdminTrips } from "@/components/admin/AdminTrips";
afterEach(cleanup);
const mount = (initialTripId?: string) => render(
  <QueryClientProvider client={new QueryClient()}><AdminTrips initialTripId={initialTripId} /></QueryClientProvider>,
);

describe("adminens turlivssyklus", () => {
  it("tilbyr riktige handlinger for utkast, aktiv og arkivert tur", () => {
    mount();
    const draft = within(screen.getByText("Tur draft").closest("li")!);
    expect(draft.getByText("Utkast")).toBeInTheDocument();
    expect(draft.getByRole("button", { name: "Rediger tur" })).toBeInTheDocument();
    expect(draft.getByRole("button", { name: "Sett som aktiv" })).toBeInTheDocument();
    expect(draft.getByRole("button", { name: "Arkiver tur" })).toBeInTheDocument();
    const active = within(screen.getByText("Tur active").closest("li")!);
    expect(active.getByRole("button", { name: "Rediger tur" })).toBeInTheDocument();
    expect(active.queryByRole("button", { name: "Arkiver tur" })).toBeNull();
    expect(active.queryByRole("button", { name: "Sett som aktiv" })).toBeNull();
    const archived = within(screen.getByText("Tur archived").closest("li")!);
    expect(archived.queryByRole("button", { name: "Rediger tur" })).toBeNull();
    expect(archived.queryByRole("button", { name: "Arkiver tur" })).toBeNull();
    expect(archived.getByRole("button", { name: "Sett som aktiv" })).toBeInTheDocument();
  });

  it("lar ikke en direkte redigeringslenke åpne en arkivert tur", () => {
    mount("archived");
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("tilbyr ikke aktivering for ukjent status eller en aktiv tur ved foreldet aktiv-ID", () => {
    expect(tripAdminActions("unknown", false)).toEqual({ canEdit: false, canActivate: false, canArchive: false });
    expect(tripAdminActions("active", false).canActivate).toBe(false);
  });
});
