import type { WorkflowState } from "@/types/workflow";

export const WORKFLOW_STORAGE_KEY = "worldcup.workflow.state";
export const REVIEW_DRAFT_STORAGE_KEY = "worldcup.workflow.draftForReview";
export const HISTORY_STORAGE_KEY = "worldcup.history.records";

export type HistoryRecord = {
  id: string;
  matchId: string;
  title: string;
  score: string;
  stage: string;
  platforms: string[];
  savedAt: string;
  route: string;
  summary?: string;
  sourceStatus?: string;
  kind: "workflow" | "report";
};

export function readWorkflowState(): WorkflowState {
  if (typeof window === "undefined") return { updatedAt: new Date().toISOString() };
  try {
    const raw = window.localStorage.getItem(WORKFLOW_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as WorkflowState) : { updatedAt: new Date().toISOString() };
  } catch {
    return { updatedAt: new Date().toISOString() };
  }
}

export function writeWorkflowState(patch: Partial<WorkflowState>) {
  if (typeof window === "undefined") return;
  const current = readWorkflowState();
  const next: WorkflowState = {
    ...current,
    ...patch,
    updatedAt: new Date().toISOString()
  };
  window.localStorage.setItem(WORKFLOW_STORAGE_KEY, JSON.stringify(next));
}

export function writeReviewDraft(content: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(REVIEW_DRAFT_STORAGE_KEY, content);
}

export function readReviewDraft() {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(REVIEW_DRAFT_STORAGE_KEY) ?? "";
}

export function appendKnowledgeContext(text: string) {
  const current = readWorkflowState();
  const nextContext = Array.from(new Set([...(current.knowledgeContext ?? []), text])).slice(-8);
  writeWorkflowState({ knowledgeContext: nextContext });
}

export function readHistoryRecords(): HistoryRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(HISTORY_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as HistoryRecord[]) : [];
  } catch {
    return [];
  }
}

export function appendHistoryRecord(record: Omit<HistoryRecord, "id" | "savedAt"> & { id?: string; savedAt?: string }) {
  if (typeof window === "undefined") return;
  const nextRecord: HistoryRecord = {
    ...record,
    id: record.id ?? `${record.kind}-${record.matchId}-${Date.now()}`,
    savedAt: record.savedAt ?? new Date().toISOString()
  };

  const current = readHistoryRecords();
  const deduped = current.filter(
    (item) =>
      !(
        item.matchId === nextRecord.matchId &&
        item.route === nextRecord.route &&
        item.kind === nextRecord.kind &&
        item.platforms.join("|") === nextRecord.platforms.join("|")
      )
  );
  window.localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify([nextRecord, ...deduped].slice(0, 40)));
}
