import AsyncStorage from "@react-native-async-storage/async-storage";

export type CitationStatus = "valid" | "warning" | "invalid";

export interface Citation {
  id: string;
  text: string;
  status: CitationStatus;
  confidence: number; // 0-100
  sourceUrl?: string;
  verdict: string;
  suggestedFix?: string;
}

export interface ScanResult {
  id: string;
  documentName: string;
  createdAt: string;
  citations: Citation[];
  totalCount: number;
  validCount: number;
  warningCount: number;
  invalidCount: number;
}

const SCANS_KEY = "citation_shield_scans";
const USAGE_KEY = "citation_shield_usage";
const SUBSCRIPTION_KEY = "citation_shield_subscription";

export const FREE_SCAN_LIMIT = 3;

export type SubscriptionTier = "free" | "pro" | "law_firm";

export interface UsageData {
  scansThisMonth: number;
  monthYear: string; // "2026-06"
}

export interface SubscriptionData {
  tier: SubscriptionTier;
  expiresAt?: string;
}

function getCurrentMonthYear(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export async function getScans(): Promise<ScanResult[]> {
  try {
    const raw = await AsyncStorage.getItem(SCANS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function saveScan(scan: ScanResult): Promise<void> {
  const scans = await getScans();
  scans.unshift(scan);
  // Keep last 100 scans
  const trimmed = scans.slice(0, 100);
  await AsyncStorage.setItem(SCANS_KEY, JSON.stringify(trimmed));
}

export async function deleteScan(id: string): Promise<void> {
  const scans = await getScans();
  const filtered = scans.filter((s) => s.id !== id);
  await AsyncStorage.setItem(SCANS_KEY, JSON.stringify(filtered));
}

export async function getUsage(): Promise<UsageData> {
  try {
    const raw = await AsyncStorage.getItem(USAGE_KEY);
    const data: UsageData = raw ? JSON.parse(raw) : { scansThisMonth: 0, monthYear: getCurrentMonthYear() };
    // Reset if new month
    if (data.monthYear !== getCurrentMonthYear()) {
      return { scansThisMonth: 0, monthYear: getCurrentMonthYear() };
    }
    return data;
  } catch {
    return { scansThisMonth: 0, monthYear: getCurrentMonthYear() };
  }
}

export async function incrementUsage(): Promise<UsageData> {
  const usage = await getUsage();
  const updated: UsageData = {
    scansThisMonth: usage.scansThisMonth + 1,
    monthYear: getCurrentMonthYear(),
  };
  await AsyncStorage.setItem(USAGE_KEY, JSON.stringify(updated));
  return updated;
}

export async function getSubscription(): Promise<SubscriptionData> {
  try {
    const raw = await AsyncStorage.getItem(SUBSCRIPTION_KEY);
    return raw ? JSON.parse(raw) : { tier: "free" };
  } catch {
    return { tier: "free" };
  }
}

export async function setSubscription(data: SubscriptionData): Promise<void> {
  await AsyncStorage.setItem(SUBSCRIPTION_KEY, JSON.stringify(data));
}

export async function canScan(): Promise<boolean> {
  const sub = await getSubscription();
  if (sub.tier !== "free") return true;
  const usage = await getUsage();
  return usage.scansThisMonth < FREE_SCAN_LIMIT;
}
