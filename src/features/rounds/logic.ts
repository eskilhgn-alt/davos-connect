export interface DebtEdge {
  from: string;
  to: string;
  amount: number;
  currency: string;
}

export interface DebtRound {
  id: string;
  buyer_id: string;
  total_cost: number;
  currency?: string | null;
  is_treated: boolean;
}

export interface DebtParticipant {
  round_id: string;
  user_id: string;
}

export interface DebtSettlement {
  from_user_id: string;
  to_user_id: string;
  amount: number;
  currency?: string | null;
}

/**
 * Calculate net person-to-person debt without mixing currencies.
 * The buyer's own share is ignored; treated rounds create no debt.
 */
export function calculateDebts(
  rounds: readonly DebtRound[],
  participants: readonly DebtParticipant[],
  settlements: readonly DebtSettlement[],
): DebtEdge[] {
  const participantsByRound = new Map<string, string[]>();
  for (const participant of participants) {
    const users = participantsByRound.get(participant.round_id) || [];
    if (!users.includes(participant.user_id)) users.push(participant.user_id);
    participantsByRound.set(participant.round_id, users);
  }

  const balances = new Map<string, number>();
  for (const round of rounds) {
    if (round.is_treated) continue;
    const users = participantsByRound.get(round.id) || [];
    if (users.length === 0) continue;
    const share = Number(round.total_cost) / users.length;
    const currency = round.currency || "NOK";
    for (const userId of users) {
      if (userId === round.buyer_id) continue;
      const key = `${currency}:${userId}:${round.buyer_id}`;
      balances.set(key, (balances.get(key) || 0) + share);
    }
  }

  for (const settlement of settlements) {
    const currency = settlement.currency || "NOK";
    const key = `${currency}:${settlement.from_user_id}:${settlement.to_user_id}`;
    balances.set(key, (balances.get(key) || 0) - Number(settlement.amount));
  }

  const debts: DebtEdge[] = [];
  const processed = new Set<string>();
  for (const [key, amount] of balances) {
    if (processed.has(key)) continue;
    const [currency, from, to] = key.split(":");
    const reverseKey = `${currency}:${to}:${from}`;
    processed.add(key);
    processed.add(reverseKey);
    const net = amount - (balances.get(reverseKey) || 0);
    if (Math.abs(net) <= 0.01) continue;
    debts.push(net > 0
      ? { from, to, amount: Math.round(net * 100) / 100, currency }
      : { from: to, to: from, amount: Math.round(Math.abs(net) * 100) / 100, currency });
  }
  return debts.sort((a, b) => a.currency.localeCompare(b.currency) || b.amount - a.amount || a.from.localeCompare(b.from));
}

