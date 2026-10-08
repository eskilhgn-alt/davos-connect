import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
const rpc = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));
import { SaveToMinnerButton } from "../SaveToMinnerButton";

describe("SaveToMinnerButton", () => {
  beforeEach(() => rpc.mockReset());
  it("confirms only after matching row, blocks double click", async () => {
    let resolve!: (v: unknown) => void;
    rpc.mockReturnValue(new Promise((r) => (resolve = r)));
    render(<SaveToMinnerButton source={{ kind: "story", id: "s1" }} />);
    const b = screen.getByRole("button");
    fireEvent.click(b); fireEvent.click(b);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("rpc_save_story_to_minner", { p_story_id: "s1" });
    resolve({ data: { id: "g1", source_story_id: "s1" }, error: null });
    await waitFor(() => expect(screen.getByText("Lagret i Minner")).toBeTruthy());
  });
  it("shows error and retries", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: "provenance_conflict" } })
       .mockResolvedValueOnce({ data: { id: "g2", source_message_id: "m" }, error: null });
    render(<SaveToMinnerButton source={{ kind: "attachment", id: "a1" }} />);
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => expect(screen.getByText("Feilet – prøv igjen")).toBeTruthy());
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => expect(screen.getByText("Lagret i Minner")).toBeTruthy());
    expect(rpc).toHaveBeenLastCalledWith("rpc_save_attachment_to_minner", { p_attachment_id: "a1" });
  });
  it("rejects mismatched story row", async () => {
    rpc.mockResolvedValue({ data: { id: "g", source_story_id: "other" }, error: null });
    render(<SaveToMinnerButton source={{ kind: "story", id: "s1" }} />);
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => expect(screen.getByText("Feilet – prøv igjen")).toBeTruthy());
  });
});
