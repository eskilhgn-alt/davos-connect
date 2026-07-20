import { describe, expect, it } from "vitest";
import { calculateDebts } from "../logic";

describe("calculateDebts", () => {
  it("splits a round across all participants but never charges the buyer", () => {
    const debts = calculateDebts(
      [{ id: "r", buyer_id: "a", total_cost: 90, currency: "EUR", is_treated: false }],
      ["a", "b", "c"].map((user_id) => ({ round_id: "r", user_id })),
      [],
    );
    expect(debts).toEqual([
      { from: "b", to: "a", amount: 30, currency: "EUR" },
      { from: "c", to: "a", amount: 30, currency: "EUR" },
    ]);
  });

  it("nets bidirectional debt", () => {
    const debts = calculateDebts(
      [
        { id: "r1", buyer_id: "a", total_cost: 40, currency: "EUR", is_treated: false },
        { id: "r2", buyer_id: "b", total_cost: 20, currency: "EUR", is_treated: false },
      ],
      [
        { round_id: "r1", user_id: "a" }, { round_id: "r1", user_id: "b" },
        { round_id: "r2", user_id: "a" }, { round_id: "r2", user_id: "b" },
      ],
      [],
    );
    expect(debts).toEqual([{ from: "b", to: "a", amount: 10, currency: "EUR" }]);
  });

  it("applies settlements and ignores treated rounds", () => {
    const debts = calculateDebts(
      [
        { id: "r1", buyer_id: "a", total_cost: 60, currency: "EUR", is_treated: false },
        { id: "gift", buyer_id: "a", total_cost: 600, currency: "EUR", is_treated: true },
      ],
      [
        { round_id: "r1", user_id: "a" }, { round_id: "r1", user_id: "b" },
        { round_id: "gift", user_id: "a" }, { round_id: "gift", user_id: "b" },
      ],
      [{ from_user_id: "b", to_user_id: "a", amount: 12, currency: "EUR" }],
    );
    expect(debts).toEqual([{ from: "b", to: "a", amount: 18, currency: "EUR" }]);
  });

  it("never nets different currencies together", () => {
    const debts = calculateDebts(
      [
        { id: "nok", buyer_id: "a", total_cost: 200, currency: "NOK", is_treated: false },
        { id: "eur", buyer_id: "b", total_cost: 20, currency: "EUR", is_treated: false },
      ],
      [
        { round_id: "nok", user_id: "a" }, { round_id: "nok", user_id: "b" },
        { round_id: "eur", user_id: "a" }, { round_id: "eur", user_id: "b" },
      ],
      [],
    );
    expect(debts).toEqual([
      { from: "a", to: "b", amount: 10, currency: "EUR" },
      { from: "b", to: "a", amount: 100, currency: "NOK" },
    ]);
  });

  it("deduplicates repeated participants", () => {
    const debts = calculateDebts(
      [{ id: "r", buyer_id: "a", total_cost: 20, currency: "EUR", is_treated: false }],
      [
        { round_id: "r", user_id: "a" },
        { round_id: "r", user_id: "b" },
        { round_id: "r", user_id: "b" },
      ],
      [],
    );
    expect(debts).toEqual([{ from: "b", to: "a", amount: 10, currency: "EUR" }]);
  });
});

