import AsyncStorage from "@react-native-async-storage/async-storage";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

export interface ChatSession {
  id: string;
  title: string;
  createdAt: string;
  messages: ChatMessage[];
}

export interface DocumentAnalysis {
  id: string;
  title: string;
  createdAt: string;
  inputText: string;
  summary: string;
  keyClauses: string[];
  redFlags: string[];
  recommendedActions: string[];
  riskScore?: number; // 0-100
  documentType?: string;
}

export interface UsageRecord {
  date: string; // YYYY-MM-DD
  questionsUsed: number;
  documentsUsed: number;
}

export interface SubscriptionState {
  isPro: boolean;
  plan: "free" | "monthly" | "annual";
  expiresAt?: string;
}

// ─── Legal Health Score ───────────────────────────────────────────────────────

export type LifeSituation =
  | "tenant"
  | "homeowner"
  | "employee"
  | "business_owner"
  | "freelancer"
  | "parent"
  | "student"
  | "retiree";

export interface LegalHealthProfile {
  situations: LifeSituation[];
  state: string; // US state abbreviation e.g. "CA"
  lastUpdated: string;
}

export interface LegalRiskItem {
  category: string;
  title: string;
  description: string;
  severity: "critical" | "high" | "medium" | "low";
  actionLabel: string;
}

export interface LegalHealthScore {
  score: number; // 0-100
  grade: "A" | "B" | "C" | "D" | "F";
  summary: string;
  risks: LegalRiskItem[];
  strengths: string[];
  generatedAt: string;
}

// ─── Situation Wizard ─────────────────────────────────────────────────────────

export type SituationType =
  | "eviction"
  | "wrongful_termination"
  | "wage_theft"
  | "contract_dispute"
  | "debt_collection"
  | "landlord_dispute"
  | "divorce"
  | "custody"
  | "discrimination"
  | "personal_injury"
  | "criminal_charge"
  | "immigration"
  | "small_claims"
  | "consumer_fraud"
  | "other";

export interface SituationStep {
  stepNumber: number;
  title: string;
  description: string;
  action: string;
  timeframe: string;
  priority: "urgent" | "high" | "medium" | "low";
  resources?: string[];
}

export interface SituationPlan {
  id: string;
  situationType: SituationType;
  situationLabel: string;
  userDescription: string;
  createdAt: string;
  urgencyLevel: "immediate" | "this_week" | "this_month" | "no_rush";
  overview: string;
  steps: SituationStep[];
  keyRights: string[];
  warningFlags: string[];
  estimatedCost: string;
  shouldHireAttorney: boolean;
  attorneyType?: string;
}

// ─── Know Your Rights Cards ───────────────────────────────────────────────────

export interface RightsCard {
  id: string;
  category: string;
  title: string;
  content: string;
  emoji: string;
  isBookmarked: boolean;
  viewedAt?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SESSIONS_KEY = "pocketlawyer_sessions";
const DOCUMENTS_KEY = "pocketlawyer_documents";
const USAGE_KEY = "pocketlawyer_usage";
const SUBSCRIPTION_KEY = "pocketlawyer_subscription";
const ONBOARDING_KEY = "pocketlawyer_onboarding_complete";
const HEALTH_PROFILE_KEY = "pocketlawyer_health_profile";
const HEALTH_SCORE_KEY = "pocketlawyer_health_score";
const SITUATION_PLANS_KEY = "pocketlawyer_situation_plans";
const RIGHTS_CARDS_KEY = "pocketlawyer_rights_cards";
const BOOKMARKED_CARDS_KEY = "pocketlawyer_bookmarked_cards";

export const FREE_QUESTIONS_PER_DAY = 5;
export const FREE_DOCUMENTS_PER_DAY = 2;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

// ─── Sessions ─────────────────────────────────────────────────────────────────

export async function getSessions(): Promise<ChatSession[]> {
  try {
    const raw = await AsyncStorage.getItem(SESSIONS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function saveSession(session: ChatSession): Promise<void> {
  const sessions = await getSessions();
  const idx = sessions.findIndex((s) => s.id === session.id);
  if (idx >= 0) {
    sessions[idx] = session;
  } else {
    sessions.unshift(session);
  }
  await AsyncStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
}

export async function deleteSession(id: string): Promise<void> {
  const sessions = await getSessions();
  await AsyncStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions.filter((s) => s.id !== id)));
}

// ─── Documents ────────────────────────────────────────────────────────────────

export async function getDocuments(): Promise<DocumentAnalysis[]> {
  try {
    const raw = await AsyncStorage.getItem(DOCUMENTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function saveDocument(doc: DocumentAnalysis): Promise<void> {
  const docs = await getDocuments();
  const idx = docs.findIndex((d) => d.id === doc.id);
  if (idx >= 0) {
    docs[idx] = doc;
  } else {
    docs.unshift(doc);
  }
  await AsyncStorage.setItem(DOCUMENTS_KEY, JSON.stringify(docs));
}

export async function deleteDocument(id: string): Promise<void> {
  const docs = await getDocuments();
  await AsyncStorage.setItem(DOCUMENTS_KEY, JSON.stringify(docs.filter((d) => d.id !== id)));
}

// ─── Usage ────────────────────────────────────────────────────────────────────

export async function getUsage(): Promise<UsageRecord> {
  try {
    const raw = await AsyncStorage.getItem(USAGE_KEY);
    const record: UsageRecord = raw ? JSON.parse(raw) : { date: today(), questionsUsed: 0, documentsUsed: 0 };
    if (record.date !== today()) {
      return { date: today(), questionsUsed: 0, documentsUsed: 0 };
    }
    return record;
  } catch {
    return { date: today(), questionsUsed: 0, documentsUsed: 0 };
  }
}

export async function incrementQuestionUsage(): Promise<void> {
  const usage = await getUsage();
  usage.questionsUsed += 1;
  await AsyncStorage.setItem(USAGE_KEY, JSON.stringify(usage));
}

export async function incrementDocumentUsage(): Promise<void> {
  const usage = await getUsage();
  usage.documentsUsed += 1;
  await AsyncStorage.setItem(USAGE_KEY, JSON.stringify(usage));
}

// ─── Subscription ─────────────────────────────────────────────────────────────

export async function getSubscription(): Promise<SubscriptionState> {
  try {
    const raw = await AsyncStorage.getItem(SUBSCRIPTION_KEY);
    return raw ? JSON.parse(raw) : { isPro: false, plan: "free" };
  } catch {
    return { isPro: false, plan: "free" };
  }
}

export async function setSubscription(state: SubscriptionState): Promise<void> {
  await AsyncStorage.setItem(SUBSCRIPTION_KEY, JSON.stringify(state));
}

// ─── Onboarding ───────────────────────────────────────────────────────────────

export async function isOnboardingComplete(): Promise<boolean> {
  try {
    const val = await AsyncStorage.getItem(ONBOARDING_KEY);
    return val === "true";
  } catch {
    return false;
  }
}

export async function markOnboardingComplete(): Promise<void> {
  await AsyncStorage.setItem(ONBOARDING_KEY, "true");
}

// ─── Legal Health Score ───────────────────────────────────────────────────────

export async function getHealthProfile(): Promise<LegalHealthProfile | null> {
  try {
    const raw = await AsyncStorage.getItem(HEALTH_PROFILE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function saveHealthProfile(profile: LegalHealthProfile): Promise<void> {
  await AsyncStorage.setItem(HEALTH_PROFILE_KEY, JSON.stringify(profile));
}

export async function getHealthScore(): Promise<LegalHealthScore | null> {
  try {
    const raw = await AsyncStorage.getItem(HEALTH_SCORE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function saveHealthScore(score: LegalHealthScore): Promise<void> {
  await AsyncStorage.setItem(HEALTH_SCORE_KEY, JSON.stringify(score));
}

// ─── Situation Plans ──────────────────────────────────────────────────────────

export async function getSituationPlans(): Promise<SituationPlan[]> {
  try {
    const raw = await AsyncStorage.getItem(SITUATION_PLANS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function saveSituationPlan(plan: SituationPlan): Promise<void> {
  const plans = await getSituationPlans();
  const idx = plans.findIndex((p) => p.id === plan.id);
  if (idx >= 0) {
    plans[idx] = plan;
  } else {
    plans.unshift(plan);
  }
  await AsyncStorage.setItem(SITUATION_PLANS_KEY, JSON.stringify(plans));
}

export async function deleteSituationPlan(id: string): Promise<void> {
  const plans = await getSituationPlans();
  await AsyncStorage.setItem(SITUATION_PLANS_KEY, JSON.stringify(plans.filter((p) => p.id !== id)));
}

// ─── Rights Cards ─────────────────────────────────────────────────────────────

export async function getBookmarkedCards(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(BOOKMARKED_CARDS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function toggleCardBookmark(cardId: string): Promise<boolean> {
  const bookmarks = await getBookmarkedCards();
  const idx = bookmarks.indexOf(cardId);
  if (idx >= 0) {
    bookmarks.splice(idx, 1);
    await AsyncStorage.setItem(BOOKMARKED_CARDS_KEY, JSON.stringify(bookmarks));
    return false;
  } else {
    bookmarks.push(cardId);
    await AsyncStorage.setItem(BOOKMARKED_CARDS_KEY, JSON.stringify(bookmarks));
    return true;
  }
}

// ─── Clear All ────────────────────────────────────────────────────────────────

export async function clearAllData(): Promise<void> {
  const keys = [
    SESSIONS_KEY,
    DOCUMENTS_KEY,
    USAGE_KEY,
    SUBSCRIPTION_KEY,
    ONBOARDING_KEY,
    HEALTH_PROFILE_KEY,
    HEALTH_SCORE_KEY,
    SITUATION_PLANS_KEY,
    RIGHTS_CARDS_KEY,
    BOOKMARKED_CARDS_KEY,
  ];
  await Promise.all(keys.map((k) => AsyncStorage.removeItem(k)));
}
