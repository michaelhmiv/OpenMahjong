import {
  validateScoringSession,
  type ScoringSession,
  type TableEvent,
  type LedgerOperation,
} from "@openmahjong/engine";
import { API_BASE } from "./api.js";

export const TABLES_KEY = "openmahjong.tables.v1";
const LAST_TABLE_ACCOUNT = "openmahjong.tables.last-account.v1";
/** Identity only, never a credential. Explicit sign-out/deletion clears it. */
export function rememberTableAccount(accountId: string): void {
  try {
    localStorage.setItem(LAST_TABLE_ACCOUNT, accountId);
  } catch {
    /* local-only still works */
  }
}
export function offlineTableAccount(): string | undefined {
  try {
    const id = localStorage.getItem(LAST_TABLE_ACCOUNT);
    return id && /^[A-Za-z0-9_-]{1,128}$/.test(id) ? id : undefined;
  } catch {
    return undefined;
  }
}
const accountEpochs = new Map<string, number>();
export interface TableCopy {
  session: ScoringSession;
  baseRevision: number;
  syncedLocalRevision: number;
  pending?: {
    mutationId: string;
    expectedRevision: number;
    session: ScoringSession;
  };
  conflict?: { revision: number; state: ScoringSession };
}
export function tableId(): string {
  return crypto.randomUUID();
}
export function tableStorageKey(accountId?: string): string {
  return accountId ? `${TABLES_KEY}.account.${accountId}` : TABLES_KEY;
}
export function readTables(accountId?: string): TableCopy[] {
  try {
    const raw: unknown = JSON.parse(
      localStorage.getItem(tableStorageKey(accountId)) ?? "[]",
    );
    if (!Array.isArray(raw)) return [];
    return raw.slice(-100).flatMap((row) => {
      try {
        const session = validateScoringSession(row.session);
        if (
          !Number.isSafeInteger(row.baseRevision) ||
          row.baseRevision < 0 ||
          !Number.isSafeInteger(row.syncedLocalRevision)
        )
          return [];
        const copy: TableCopy = {
          session,
          baseRevision: row.baseRevision,
          syncedLocalRevision: row.syncedLocalRevision,
        };
        if (row.pending)
          copy.pending = {
            mutationId: String(row.pending.mutationId),
            expectedRevision: row.pending.expectedRevision,
            session: validateScoringSession(row.pending.session),
          };
        if (row.conflict)
          copy.conflict = {
            revision: row.conflict.revision,
            state: validateScoringSession(row.conflict.state),
          };
        return [copy];
      } catch {
        return [];
      }
    });
  } catch {
    return [];
  }
}
export function writeTable(copy: TableCopy, accountId?: string): void {
  validateScoringSession(copy.session);
  const copies = readTables(accountId).filter(
    (row) => row.session.id !== copy.session.id,
  );
  if (copies.length >= 100)
    throw new Error("This device already has 100 table sessions");
  localStorage.setItem(
    tableStorageKey(accountId),
    JSON.stringify([...copies, copy]),
  );
}
export function appendTableEvent(
  copy: TableCopy,
  event: TableEvent,
  recordId = tableId(),
): TableCopy {
  const session: ScoringSession = {
    ...copy.session,
    finished: false,
    revision: copy.session.revision + 1,
    updatedAt: new Date().toISOString(),
    ledger: [
      ...copy.session.ledger,
      { id: tableId(), kind: "set", recordId, event },
    ],
  };
  return { ...copy, session: validateScoringSession(session) };
}
export function nextUndoTarget(
  session: ScoringSession,
): LedgerOperation | undefined {
  const disabled = new Set<string>();
  for (const op of [...session.ledger].reverse())
    if (op.kind === "undo" && !disabled.has(op.id)) disabled.add(op.target);
  return [...session.ledger]
    .reverse()
    .find((op) => op.kind === "set" && !disabled.has(op.id));
}
export function undoTable(copy: TableCopy): TableCopy {
  const target = nextUndoTarget(copy.session);
  if (!target) return copy;
  const session: ScoringSession = {
    ...copy.session,
    finished: false,
    revision: copy.session.revision + 1,
    updatedAt: new Date().toISOString(),
    ledger: [
      ...copy.session.ledger,
      { id: tableId(), kind: "undo", target: target.id },
    ],
  };
  return { ...copy, session: validateScoringSession(session) };
}
export function deleteTableAccountCache(accountId: string): void {
  accountEpochs.set(accountId, (accountEpochs.get(accountId) ?? 0) + 1);
  try {
    localStorage.removeItem(tableStorageKey(accountId));
    if (offlineTableAccount() === accountId)
      localStorage.removeItem(LAST_TABLE_ACCOUNT);
  } catch {
    /* storage unavailable */
  }
}
export async function syncTable(
  id: string,
  auth: { accountId: string; csrfToken: string },
  fetchFn: typeof fetch = fetch,
): Promise<"saved" | "conflict" | "offline"> {
  const epoch = accountEpochs.get(auth.accountId);
  let copy = readTables(auth.accountId).find((row) => row.session.id === id);
  if (!copy) throw new Error("Session unavailable");
  if (copy.conflict) return "conflict";
  if (!copy.pending) {
    copy = {
      ...copy,
      pending: {
        mutationId: tableId(),
        expectedRevision: copy.baseRevision,
        session: copy.session,
      },
    };
    writeTable(copy, auth.accountId);
  }
  const pending = copy.pending!;
  let response: Response;
  try {
    response = await fetchFn(
      `${API_BASE}/api/table-sessions/${encodeURIComponent(id)}`,
      {
        method: "PUT",
        credentials: "include",
        headers: {
          "content-type": "application/json",
          "x-csrf-token": auth.csrfToken,
        },
        body: JSON.stringify(pending),
      },
    );
  } catch {
    return "offline";
  }
  if (!response.ok && response.status !== 409) return "offline";
  let body: {
    status: string;
    entry: { revision: number; state: unknown } | null;
  };
  try {
    body = await response.json();
  } catch {
    return "offline";
  }
  if (accountEpochs.get(auth.accountId) !== epoch) return "offline";
  const current = readTables(auth.accountId).find(
    (row) => row.session.id === id,
  );
  if (!current) return "offline";
  if (current.pending?.mutationId !== pending.mutationId)
    return current.conflict ? "conflict" : "saved";
  if (response.status === 409 && !body.entry) return "offline";
  if (
    response.status === 409 ||
    (body.status === "duplicate" &&
      body.entry &&
      body.entry.revision !== pending.expectedRevision + 1)
  ) {
    if (body.entry) {
      try {
        current.conflict = {
          revision: body.entry.revision,
          state: validateScoringSession(body.entry.state),
        };
        writeTable(current, auth.accountId);
      } catch {
        return "offline";
      }
    }
    return "conflict";
  }
  if (!body.entry || !Number.isSafeInteger(body.entry.revision))
    return "offline";
  const { pending: _pending, ...updated } = current;
  updated.baseRevision = body.entry.revision;
  updated.syncedLocalRevision = pending.session.revision;
  writeTable(updated, auth.accountId);
  return updated.session.revision !== pending.session.revision
    ? syncTable(id, auth, fetchFn)
    : "saved";
}
/** Both versions survive resolution: the local edits become a new session. */
export function preserveTableConflict(
  copy: TableCopy,
  accountId: string,
): TableCopy {
  if (!copy.conflict) return copy;
  const preserved: TableCopy = {
    session: {
      ...copy.session,
      id: tableId(),
      updatedAt: new Date().toISOString(),
    },
    baseRevision: 0,
    syncedLocalRevision: -1,
  };
  writeTable(preserved, accountId);
  const remote: TableCopy = {
    session: copy.conflict.state,
    baseRevision: copy.conflict.revision,
    syncedLocalRevision: copy.conflict.state.revision,
  };
  writeTable(remote, accountId);
  return preserved;
}
export async function pullTables(
  accountId: string,
  fetchFn: typeof fetch = fetch,
): Promise<number> {
  const epoch = accountEpochs.get(accountId);
  const response = await fetchFn(`${API_BASE}/api/table-sessions`, {
    credentials: "include",
  });
  if (!response.ok) throw new Error("Account sessions unavailable");
  const body = (await response.json()) as {
    sessions: { id: string; revision: number }[];
  };
  if (!Array.isArray(body.sessions) || body.sessions.length > 100)
    throw new Error("Invalid account sessions");
  let loaded = 0;
  for (const summary of body.sessions) {
    const current = readTables(accountId).find(
      (row) => row.session.id === summary.id,
    );
    if (current && current.baseRevision >= summary.revision) continue;
    const detail = await fetchFn(
      `${API_BASE}/api/table-sessions/${encodeURIComponent(summary.id)}`,
      { credentials: "include" },
    );
    if (!detail.ok) continue;
    const entry = (
      (await detail.json()) as { session: { state: unknown; revision: number } }
    ).session;
    if (accountEpochs.get(accountId) !== epoch) return loaded;
    const state = validateScoringSession(entry.state);
    if (
      current &&
      (current.pending ||
        current.session.revision !== current.syncedLocalRevision)
    )
      writeTable(
        { ...current, conflict: { revision: entry.revision, state } },
        accountId,
      );
    else
      writeTable(
        {
          session: state,
          baseRevision: entry.revision,
          syncedLocalRevision: state.revision,
        },
        accountId,
      );
    loaded++;
  }
  return loaded;
}
