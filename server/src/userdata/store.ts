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

/**
 * 填报进度：只记录「填了几项」，不记录填了什么。
 *
 * 判定页的填写内容按设计不落库（离开页面即清空），但用户换台设备后
 * 需要知道「上次还有哪几份没填完」，所以这里存极少量的元数据：
 * 政策、已填项数、总项数、更新时间。任何一个字段值都不会被保存。
 */
export interface ProgressEntry {
  policyId: string;
  policyTitle: string;
  filled: number;
  total: number;
  updatedAt: string;
}

interface UserDataFile {
  version: 1;
  /** userId -> policyId -> 草稿 */
  drafts: Record<string, Record<string, DraftEntry>>;
  /** userId -> 最近的判定记录（新的在前） */
  records: Record<string, JudgementRecord[]>;
  /** userId -> policyId -> 填报进度（只有数量，没有内容） */
  progress: Record<string, Record<string, ProgressEntry>>;
}

/** 每个账号最多保留的判定记录条数 */
export const MAX_RECORDS = 20;

function userDataFile(): string {
  return process.env.USERDATA_FILE ?? path.join(REPO_ROOT, 'data', 'user-data.json');
}

const EMPTY_DATA = (): UserDataFile => ({ version: 1, drafts: {}, records: {}, progress: {} });

function readData(): UserDataFile {
  const file = userDataFile();
  if (!existsSync(file)) return EMPTY_DATA();
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as Partial<UserDataFile>;
    return {
      version: 1,
      drafts: parsed.drafts ?? {},
      records: parsed.records ?? {},
      progress: parsed.progress ?? {},
    };
  } catch {
    return EMPTY_DATA();
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

/** 清掉某个账号在某份政策下的草稿：离开判定页时调用，不在服务端留填报内容 */
export function clearDraft(userId: string, policyId: string): boolean {
  const data = readData();
  const bucket = data.drafts[userId];
  if (!bucket || !(policyId in bucket)) return false;
  delete bucket[policyId];
  if (Object.keys(bucket).length === 0) delete data.drafts[userId];
  writeData(data);
  return true;
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

/** 某账号下所有「填到一半」的进度，按更新时间倒序 */
export function listProgress(userId: string): ProgressEntry[] {
  const bucket = readData().progress[userId] ?? {};
  return Object.values(bucket).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/** 上报一份政策的填报进度：只有数量，没有内容 */
export function saveProgress(
  userId: string,
  policyId: string,
  input: { policyTitle: string; filled: number; total: number },
): ProgressEntry {
  const data = readData();
  const entry: ProgressEntry = {
    policyId,
    policyTitle: input.policyTitle,
    filled: input.filled,
    total: input.total,
    updatedAt: new Date().toISOString(),
  };
  data.progress[userId] = { ...(data.progress[userId] ?? {}), [policyId]: entry };
  writeData(data);
  return entry;
}

/** 清掉某份政策的填报进度：判定完成后调用 */
export function clearProgress(userId: string, policyId: string): boolean {
  const data = readData();
  const bucket = data.progress[userId];
  if (!bucket || !(policyId in bucket)) return false;
  delete bucket[policyId];
  if (Object.keys(bucket).length === 0) delete data.progress[userId];
  writeData(data);
  return true;
}

/** 清空全部填报进度（「清空我的数据」用） */
export function clearAllProgress(userId: string): void {
  const data = readData();
  if (!data.progress[userId]) return;
  delete data.progress[userId];
  writeData(data);
}

export function clearRecords(userId: string): void {
  const data = readData();
  data.records[userId] = [];
  writeData(data);
}
