import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Trip } from "@/hooks/useActiveTrip";

const backend = vi.hoisted(() => ({
  user: { id: "admin" },
  trips: [] as Trip[],
  rpc: vi.fn(),
  events: [] as Array<() => void>,
  subscriptions: [] as Array<(status: string) => void>,
  pendingRead: null as Promise<{ data: Trip[]; error: null }> | null,
  success: vi.fn(), error: vi.fn(),
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: backend.user }) }));
vi.mock("sonner", () => ({ toast: { success: backend.success, error: backend.error, message: vi.fn() } }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  rpc: (...args: unknown[]) => backend.rpc(...args),
  from: (table: string) => {
    let id: string | undefined;
    const query = {
      select: () => query,
      eq: (key: string, value: string) => { if (key === "id" || key === "trip_id") id = value; return query; },
      maybeSingle: async () => ({ data: table === "trips" ? backend.trips.find(t => t.id === id) : { trip_id: id }, error: null }),
      then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => {
        if (table === "trips" && backend.pendingRead) {
          const pending = backend.pendingRead; backend.pendingRead = null;
          return pending.then(resolve, reject);
        }
        const data = table === "trips" ? structuredClone(backend.trips) : backend.trips.map(t => ({ trip_id: t.id }));
        return Promise.resolve({ data, error: null }).then(resolve, reject);
      },
    };
    return query;
  },
  channel: () => {
    const listeners: Array<() => void> = [];
    const channel = {
      on: (_event: string, filter: { table: string }, fn: () => void) => {
        if (filter.table === "trips") { backend.events.push(fn); listeners.push(fn); }
        return channel;
      },
      subscribe: (fn?: (status: string) => void) => { if (fn) backend.subscriptions.push(fn); return channel; },
      dispose: () => { backend.events = backend.events.filter(fn => !listeners.includes(fn)); },
    };
    return channel;
  },
  removeChannel: (channel: { dispose: () => void }) => channel.dispose(),
} }));

import { AdminTrips } from "@/components/admin/AdminTrips";
import { TripProvider, useTrip } from "@/contexts/TripContext";

const initial: Trip = {
  id: "trip-a", name: "Val Thorens 2027", destination: "Val Thorens", country: "France",
  timezone: "Europe/Paris", currency: "EUR", start_date: null, end_date: null, status: "active",
  destination_config: { center: { lat: 45.2977, lon: 6.5804 }, weatherUrl: "https://example.com/weather" },
};
function TripView({ label }: { label: string }) {
  const { selectedTrip } = useTrip();
  return <output aria-label={label}>{JSON.stringify(selectedTrip)}</output>;
}
function mount(editor = true, client = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  return render(<QueryClientProvider client={client}>
    <TripProvider>{editor && <AdminTrips />}<TripView label={editor ? "Hjem" : "Annen enhet"} />{editor && <TripView label="Plan" />}</TripProvider>
  </QueryClientProvider>);
}
async function edit() {
  fireEvent.click(await screen.findByRole("button", { name: "Rediger tur" }));
  return within(screen.getByRole("dialog", { name: "Rediger tur" }));
}
function dates(form: ReturnType<typeof within>) {
  fireEvent.change(form.getByLabelText("Startdato"), { target: { value: "2027-02-10" } });
  fireEvent.change(form.getByLabelText("Sluttdato"), { target: { value: "2027-02-17" } });
}
beforeEach(() => {
  localStorage.clear(); backend.trips = [structuredClone(initial)]; backend.events = []; backend.subscriptions = [];
  backend.pendingRead = null; backend.success.mockReset(); backend.error.mockReset();
  backend.rpc.mockReset().mockImplementation(async (_rpc, params) => {
    const row = { ...backend.trips[0] } as Trip;
    for (const key of ["name", "destination", "country", "timezone", "currency", "start_date", "end_date", "destination_config"] as const) {
      if (`p_${key}` in params) Object.assign(row, { [key]: params[`p_${key}`] });
    }
    backend.trips = [row]; return { data: row, error: null };
  });
});
afterEach(cleanup);

describe("faktisk turlagring gjennom AdminTrips og TripProvider", () => {
  it("lagrer dato og info, oppdaterer begge appflater og leser verdiene etter ny åpning", async () => {
    const app = mount(); const form = await edit(); dates(form);
    fireEvent.change(form.getByLabelText("Navn"), { target: { value: "Vinterturen" } });
    fireEvent.click(form.getByRole("button", { name: "Lagre" }));
    await waitFor(() => expect(backend.success).toHaveBeenCalled());
    for (const label of ["Hjem", "Plan"]) {
      expect(screen.getByLabelText(label)).toHaveTextContent("Vinterturen");
      expect(screen.getByLabelText(label)).toHaveTextContent("2027-02-10");
    }
    expect(backend.rpc).toHaveBeenCalledTimes(1);
    expect(backend.trips[0].destination_config).toEqual(initial.destination_config);
    app.unmount(); mount(false);
    await waitFor(() => expect(screen.getByLabelText("Annen enhet")).toHaveTextContent("2027-02-17"));
  });

  it("lar datoer lagres selv om urørt kart/Oppdag-oppsett er ufullstendig", async () => {
    backend.trips[0].destination_config = { discovery: { providers: ["google-places"], categories: [] }, custom: "behold" };
    mount(); const form = await edit(); dates(form);
    fireEvent.click(form.getByRole("button", { name: "Lagre" }));
    await waitFor(() => expect(backend.success).toHaveBeenCalled());
    expect(backend.trips[0].start_date).toBe("2027-02-10");
    expect(backend.trips[0].destination_config.custom).toBe("behold");
  });

  it("bevarer et utfylt skjema mens turene oppdateres i bakgrunnen", async () => {
    mount(); const form = await edit(); dates(form);
    let finish!: (value: { data: Trip[]; error: null }) => void;
    backend.pendingRead = new Promise(resolve => { finish = resolve; });
    await act(async () => { backend.events[0](); });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await act(async () => { finish({ data: structuredClone(backend.trips), error: null }); });
    expect(screen.getByLabelText("Startdato")).toHaveValue("2027-02-10");
    fireEvent.click(screen.getByRole("button", { name: "Lagre" }));
    await waitFor(() => expect(backend.success).toHaveBeenCalled());
  });

  it("viser serverfeil i skjemaet og beholder datoene uten å vise falsk suksess", async () => {
    backend.rpc.mockResolvedValue({ data: null, error: { message: "Serveren er utilgjengelig" } });
    mount(); const form = await edit(); dates(form);
    fireEvent.click(form.getByRole("button", { name: "Lagre" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Serveren er utilgjengelig");
    expect(screen.getByLabelText("Startdato")).toHaveValue("2027-02-10");
    expect(backend.success).not.toHaveBeenCalled();
  });

  it("godtar ikke en retur som har datoene, men gammelt navn eller feil tur-ID", async () => {
    backend.rpc.mockResolvedValue({ data: { ...initial, id: "other-trip", start_date: "2027-02-10", end_date: "2027-02-17" }, error: null });
    mount(); const form = await edit(); dates(form);
    fireEvent.change(form.getByLabelText("Navn"), { target: { value: "Nytt navn" } });
    fireEvent.click(form.getByRole("button", { name: "Lagre" }));
    await waitFor(() => expect(backend.error).toHaveBeenCalled());
    expect(backend.success).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("henter datoer fra serveren når appen får fokus igjen etter en mistet sanntidshendelse", async () => {
    mount(false);
    await waitFor(() => expect(screen.getByLabelText("Annen enhet")).toHaveTextContent("Val Thorens"));
    backend.trips[0] = { ...backend.trips[0], start_date: "2027-03-01" };
    await act(async () => { window.dispatchEvent(new Event("focus")); });
    await waitFor(() => expect(screen.getByLabelText("Annen enhet")).toHaveTextContent("2027-03-01"));
  });

  it("oppdaterer en annen åpen app når turhendelsen mottas", async () => {
    mount(); mount(false); const form = await edit(); dates(form);
    fireEvent.click(form.getByRole("button", { name: "Lagre" }));
    await waitFor(() => expect(backend.success).toHaveBeenCalled());
    await act(async () => { backend.events.forEach(fn => fn()); });
    await waitFor(() => expect(screen.getByLabelText("Annen enhet")).toHaveTextContent("2027-02-17"));
  });

  it("kan endre tidssone og valuta uten å kreve kartkoordinater", async () => {
    backend.trips[0].destination_config = {};
    mount(); const form = await edit(); dates(form);
    fireEvent.change(form.getByLabelText("Tidssone (IANA)"), { target: { value: "Europe/Oslo" } });
    fireEvent.change(form.getByLabelText("Valuta (ISO)"), { target: { value: "nok" } });
    fireEvent.click(form.getByRole("button", { name: "Lagre" }));
    await waitFor(() => expect(backend.success).toHaveBeenCalled());
    expect(backend.trips[0]).toMatchObject({ timezone: "Europe/Oslo", currency: "NOK", destination_config: {} });
  });

  it("avviser nye ugyldige kartverdier før noe skrives til serveren", async () => {
    mount(); const form = await edit(); dates(form);
    fireEvent.change(form.getByLabelText("Breddegrad"), { target: { value: "100" } });
    fireEvent.click(form.getByRole("button", { name: "Lagre" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Breddegrad må være mellom -90 og 90");
    expect(backend.rpc).not.toHaveBeenCalled();
  });

  it("avslutter en bekreftet lagring selv om andre datakilder fortsatt laster", async () => {
    const client = new QueryClient();
    vi.spyOn(client, "invalidateQueries").mockImplementation(() => new Promise(() => {}));
    mount(true, client); const form = await edit(); dates(form);
    fireEvent.click(form.getByRole("button", { name: "Lagre" }));
    await waitFor(() => expect(backend.success).toHaveBeenCalled());
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByLabelText("Hjem")).toHaveTextContent("2027-02-10");
  });
});
