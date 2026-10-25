import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
/** server/src/userdata -> 仓库根目录 */
const REPO_ROOT = path.resolve(HERE, '..', '..', '..');

export type VerdictValue = 'pass' | 'fail' | 'unknown' | 'warn';

export interface JudgementSummary {
  pass: number;
  fail: number;
  unknown: number;
  warn: number;
  requiredTotal: number;
}

export interface JudgementRecord {
  id: string;
  policyId: string;
  policyTitle: string;
  overall: VerdictValue;
  summary: JudgementSummary;
  at: string;
}

export interface DraftEntry {
  profile: Record<string, unknown>;
  updatedAt: string;
}

interface UserDataFile {
  version: 1;
  /** userId -> policyId -> 草稿 */
  drafts: Record<string, Record<string, DraftEntry>>;
  /** userId -> 最近的判定记录（新的在前） */
  records: Record<string, JudgementRecord[]>;
}

/** 每个账号最多保留的判定记录条数 */
export const MAX_RECORDS = 20;

function userDataFile(): string {
  return process.env.USERDATA_FILE ?? path.join(REPO_ROOT, 'data', 'user-data.json');
}

function readData(): UserDataFile {
  const file = userDataFile();
  if (!existsSync(file)) return { version: 1, drafts: {}, records: {} };
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as Partial<UserDataFile>;
    return {
      version: 1,
      drafts: parsed.drafts ?? {},
      records: parsed.records ?? {},
    };
  } catch {
    return { version: 1, drafts: {}, records: {} };
  }
}

function writeData(data: UserDataFile): void {
  const file = userDataFile();
  mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  renameSync(tmp, file);
}

export function getDraft(userId: string, policyId: string): DraftEntry | null {
  return readData().drafts[userId]?.[policyId] ?? null;
}

export function saveDraft(userId: string, policyId: string, profile: Record<string, unknown>): DraftEntry {
  const data = readData();
  const entry: DraftEntry = { profile, updatedAt: new Date().toISOString() };
  data.drafts[userId] = { ...(data.drafts[userId] ?? {}), [policyId]: entry };
  writeData(data);
  return entry;
}

export function listRecords(userId: string): JudgementRecord[] {
  return readData().records[userId] ?? [];
}

export interface AddRecordInput {
  policyId: string;
  policyTitle: string;
  overall: VerdictValue;
  summary: JudgementSummary;
}

export function addRecord(userId: string, input: AddRecordInput): JudgementRecord {
  const data = readData();
  const record: JudgementRecord = {
    id: randomUUID(),
    policyId: input.policyId,
    policyTitle: input.policyTitle,
    overall: input.overall,
    summary: input.summary,
    at: new Date().toISOString(),
  };
  const list = [record, ...(data.records[userId] ?? [])].slice(0, MAX_RECORDS);
  data.records[userId] = list;
  writeData(data);
  return record;
}

export function clearRecords(userId: string): void {
  const data = readData();
  data.records[userId] = [];
  writeData(data);
}
