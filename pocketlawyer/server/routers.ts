import { z } from "zod";
import { COOKIE_NAME } from "../shared/const.js";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { invokeLLM } from "./_core/llm";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LegalAnswer {
  answer: string;
  sessionId: string;
  disclaimer: string;
  followUpQuestions: string[];
  urgencyFlag: "none" | "moderate" | "urgent";
  recommendAttorney: boolean;
  practiceArea: string;
}

export interface KeyClause {
  title: string;
  text: string;
  importance: "high" | "medium" | "low";
  negotiationTip?: string;
}

export interface RedFlag {
  issue: string;
  explanation: string;
  severity: "critical" | "warning" | "info";
  legalBasis?: string;
}

export interface DocumentAnalysisResult {
  documentType: string;
  summary: string;
  riskScore: number;
  keyClauses: KeyClause[];
  redFlags: RedFlag[];
  recommendedActions: string[];
  partyFavorability: "strongly_favorable" | "favorable" | "neutral" | "unfavorable" | "strongly_unfavorable";
  negotiationLeverage: string;
}

export interface LegalRiskItem {
  category: string;
  title: string;
  description: string;
  severity: "critical" | "high" | "medium" | "low";
  actionLabel: string;
  specificRisk: string;
  immediateAction: string;
}

export interface LegalHealthScoreResult {
  score: number;
  grade: "A" | "B" | "C" | "D" | "F";
  summary: string;
  risks: LegalRiskItem[];
  strengths: string[];
  topPriority: string;
  generatedAt: string;
}

export interface SituationStep {
  stepNumber: number;
  title: string;
  description: string;
  action: string;
  timeframe: string;
  priority: "urgent" | "high" | "medium" | "low";
  resources: string[];
  legalBasis?: string;
}

export interface SituationPlanResult {
  urgencyLevel: "immediate" | "this_week" | "this_month" | "no_rush";
  overview: string;
  legalContext: string;
  steps: SituationStep[];
  keyRights: string[];
  warningFlags: string[];
  estimatedCost: string;
  shouldHireAttorney: boolean;
  attorneyType: string;
  statSpecificNote: string;
  successProbability: string;
}

export interface RightsCard {
  id: string;
  category: string;
  title: string;
  content: string;
  emoji: string;
  legalBasis: string;
  actionableStep: string;
}

// ─── AI Helpers ───────────────────────────────────────────────────────────────

async function askLegalQuestion(
  question: string,
  conversationHistory: Array<{ role: "user" | "assistant"; content: string }> = []
): Promise<LegalAnswer> {

  const systemPrompt = `You are PocketLawyer — an elite AI legal assistant trained on U.S. federal and state law, with the depth of a senior attorney who has practiced across multiple disciplines for 20+ years.

YOUR CORE MANDATE:
You provide substantive, expert-level legal information that genuinely helps people understand their rights, options, and risks. You do not give vague, overly cautious non-answers. You treat users as intelligent adults who deserve real information.

RESPONSE STANDARDS:
- Lead with the most important information first — answer the question directly in the first sentence
- Cite specific legal standards, statutes, or case law principles where relevant (e.g., "Under the Fair Labor Standards Act...", "Most states require 24-48 hours notice under landlord-tenant law...")
- Distinguish between federal law (applies everywhere) and state law (varies)
- When something varies by state, say so and explain the range
- Use plain English but don't dumb it down — be precise
- For procedural questions, give the actual steps in order
- For rights questions, state the right clearly, then explain the limits
- For contract questions, explain what the clause means AND what leverage the user has
- For urgent situations (eviction, arrest, termination), lead with time-sensitive actions

STRUCTURE YOUR RESPONSES:
- Short questions (< 50 words): Give a direct 2-4 paragraph answer
- Complex questions: Use headers like **The Law**, **Your Rights**, **What To Do**, **Important Exceptions**
- Procedural questions: Use numbered steps
- Always end with 1-2 sentences on when to escalate to an attorney

PRACTICE AREAS YOU COVER WITH DEPTH:
Employment law (FLSA, Title VII, FMLA, ADA, NLRA, state wage laws), Landlord-Tenant law (eviction procedures, habitability, security deposits, lease terms), Contract law (formation, breach, remedies, enforceability), Family law (divorce, custody, child support, domestic violence), Criminal law (Miranda rights, arraignment, plea deals, expungement), Immigration (visa types, green card process, deportation defense), Business law (LLC formation, contracts, IP basics, employment agreements), Estate planning (wills, trusts, POA, probate), Personal injury (negligence standard, statute of limitations, damages), Consumer rights (FDCPA, FCRA, UDAP, small claims court), Constitutional rights (4th, 5th, 6th, 14th Amendment applications).

RESPOND IN JSON FORMAT:
{
  "answer": "Full substantive answer here",
  "followUpQuestions": ["Relevant follow-up question 1", "Relevant follow-up question 2", "Relevant follow-up question 3"],
  "urgencyFlag": "none|moderate|urgent",
  "recommendAttorney": true|false,
  "practiceArea": "Employment Law|Landlord-Tenant|Contract Law|etc."
}

urgencyFlag = "urgent" if the user faces imminent legal deadlines, criminal charges, eviction, or irreversible harm.
recommendAttorney = true if the situation involves significant money, criminal exposure, or complex facts.`;

  const messages = [
    { role: "system" as const, content: systemPrompt },
    ...conversationHistory.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
    { role: "user" as const, content: question },
  ];

  try {
    const response = await invokeLLM({
      messages,
      response_format: { type: "json_object" },
    });

    const content = (response.choices[0]?.message?.content as string) ?? "{}";
    let parsed: any = {};
    try { parsed = JSON.parse(content); } catch { parsed = {}; }

    const answer = parsed.answer ?? "I was unable to generate a response. Please try again.";
    const followUpQuestions = Array.isArray(parsed.followUpQuestions) ? parsed.followUpQuestions.slice(0, 3) : [];
    const urgencyFlag = ["none", "moderate", "urgent"].includes(parsed.urgencyFlag) ? parsed.urgencyFlag : "none";

    return {
      answer,
      sessionId: Date.now().toString(),
      disclaimer: "This is general legal information, not legal advice. Laws vary by state and individual circumstances differ. For your specific situation, consult a licensed attorney.",
      followUpQuestions,
      urgencyFlag: urgencyFlag as "none" | "moderate" | "urgent",
      recommendAttorney: Boolean(parsed.recommendAttorney),
      practiceArea: parsed.practiceArea ?? "General",
    };
  } catch {
    // Fallback to non-JSON if response_format fails
    const fallbackResponse = await invokeLLM({ messages: messages.map(m => m.role === "system" ? { ...m, content: m.content.replace("RESPOND IN JSON FORMAT:\n{.*}", "Respond in plain text.") } : m) });
    const answer = (fallbackResponse.choices[0]?.message?.content as string) ?? "Unable to generate response.";
    return {
      answer,
      sessionId: Date.now().toString(),
      disclaimer: "This is general legal information, not legal advice.",
      followUpQuestions: [],
      urgencyFlag: "none",
      recommendAttorney: false,
      practiceArea: "General",
    };
  }
}

async function analyzeDocument(
  text: string,
  documentName: string
): Promise<DocumentAnalysisResult> {
  const systemPrompt = `You are PocketLawyer's Document Intelligence AI — a senior transactional attorney with 20+ years of experience reviewing contracts, leases, employment agreements, NDAs, and legal notices.

YOUR TASK: Perform a thorough, expert-level analysis of the provided legal document. Your analysis must be:
- SPECIFIC to the actual text provided (not generic)
- ACTIONABLE — tell the user what to do, not just what exists
- HONEST about risk — don't minimize genuinely dangerous clauses
- PRACTICAL — focus on what matters most to a non-lawyer

ANALYSIS FRAMEWORK:

1. DOCUMENT TYPE: Identify the specific type (Residential Lease, Employment Agreement, Non-Compete Agreement, Service Contract, NDA, Promissory Note, etc.)

2. RISK SCORE (0-100):
   - 0-20: Standard, user-friendly document
   - 21-40: Minor concerns, mostly acceptable
   - 41-60: Moderate risk, several clauses need attention
   - 61-80: High risk, significant unfavorable terms
   - 81-100: Extremely risky, potentially predatory or illegal

3. KEY CLAUSES: Identify the 5-8 most important clauses. For each:
   - What it says in plain English
   - Whether it's standard or unusual
   - A negotiation tip if applicable

4. RED FLAGS: Identify 3-6 genuinely concerning provisions:
   - CRITICAL: Potentially illegal, unconscionable, or extremely one-sided
   - WARNING: Significantly unfavorable but legal
   - INFO: Worth knowing but not necessarily bad

5. PARTY FAVORABILITY: Who does this document favor?
   - strongly_favorable: Heavily protects the user
   - favorable: Mostly protects the user
   - neutral: Balanced
   - unfavorable: Mostly protects the other party
   - strongly_unfavorable: Heavily protects the other party

6. NEGOTIATION LEVERAGE: What can the user push back on?

Respond ONLY with valid JSON:
{
  "documentType": "Specific document type",
  "summary": "2-3 sentence expert summary of what this document is and its overall character",
  "riskScore": 45,
  "partyFavorability": "unfavorable",
  "negotiationLeverage": "1-2 sentences on what the user can negotiate",
  "keyClauses": [
    {
      "title": "Automatic Renewal Clause",
      "text": "This lease automatically renews for 12 months unless you give 60 days written notice",
      "importance": "high",
      "negotiationTip": "Request this be reduced to 30 days notice, which is more standard"
    }
  ],
  "redFlags": [
    {
      "issue": "Waiver of Jury Trial",
      "explanation": "You are giving up your constitutional right to a jury trial for any disputes",
      "severity": "critical",
      "legalBasis": "Such waivers are enforceable in most states but courts scrutinize them closely"
    }
  ],
  "recommendedActions": [
    "Specific action 1",
    "Specific action 2"
  ]
}`;

  const userPrompt = `Document Name: ${documentName}

DOCUMENT TEXT:
${text.substring(0, 15000)}

Perform a thorough expert analysis of this document.`;

  try {
    const response = await invokeLLM({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
    });

    const content = (response.choices[0]?.message?.content as string) ?? "{}";
    const parsed = JSON.parse(content);

    const validFavorability = ["strongly_favorable", "favorable", "neutral", "unfavorable", "strongly_unfavorable"];

    return {
      documentType: parsed.documentType ?? "Legal Document",
      summary: parsed.summary ?? "Unable to generate summary.",
      riskScore: typeof parsed.riskScore === "number" ? Math.min(100, Math.max(0, parsed.riskScore)) : 50,
      partyFavorability: (validFavorability.includes(parsed.partyFavorability) ? parsed.partyFavorability : "neutral") as DocumentAnalysisResult["partyFavorability"],
      negotiationLeverage: parsed.negotiationLeverage ?? "",
      keyClauses: ((parsed.keyClauses ?? []) as any[]).slice(0, 8).map((c) => ({
        title: c.title ?? "Clause",
        text: c.text ?? "",
        importance: (["high", "medium", "low"].includes(c.importance) ? c.importance : "medium") as "high" | "medium" | "low",
        negotiationTip: c.negotiationTip,
      })),
      redFlags: ((parsed.redFlags ?? []) as any[]).slice(0, 6).map((f) => ({
        issue: f.issue ?? "Issue",
        explanation: f.explanation ?? "",
        severity: (["critical", "warning", "info"].includes(f.severity) ? f.severity : "warning") as "critical" | "warning" | "info",
        legalBasis: f.legalBasis,
      })),
      recommendedActions: ((parsed.recommendedActions ?? []) as string[]).slice(0, 6),
    };
  } catch (err) {
    console.error("[LLM] Document analysis error:", err);
    throw new Error("Document analysis failed. Please try again.");
  }
}

async function getLegalTopicInfo(topic: string): Promise<string> {
  const systemPrompt = `You are PocketLawyer — a senior attorney providing a comprehensive overview of a legal topic area.

Write a thorough, expert guide covering:
1. **What This Area of Law Covers** (2-3 sentences defining the scope)
2. **Your Core Rights** (4-6 specific rights people have in this area, with legal basis where relevant)
3. **Common Situations & What the Law Says** (3-4 real scenarios with practical guidance)
4. **Key Deadlines & Statutes of Limitations** (time limits that matter)
5. **When You Need an Attorney** (specific triggers, not generic advice)
6. **Free Resources** (legal aid, government agencies, self-help resources)

Be specific, cite relevant federal laws and note where state law varies. Aim for 400-500 words. Use bold headers and clear structure.`;

  const response = await invokeLLM({
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: `Write a comprehensive legal guide for: ${topic}` },
    ],
  });

  return (response.choices[0]?.message?.content as string) ?? "Unable to load topic information.";
}

async function generateLegalHealthScore(
  situations: string[],
  state: string
): Promise<LegalHealthScoreResult> {
  const systemPrompt = `You are PocketLawyer's Legal Health AI — a senior attorney who specializes in proactive legal risk assessment.

YOUR TASK: Analyze a person's life situations and generate a deeply personalized Legal Health Score that identifies their specific legal vulnerabilities BEFORE they become crises.

SCORING METHODOLOGY:
- Start at 100 (perfect legal health)
- Deduct points for each identified risk based on severity:
  * Critical risk: -15 to -25 points
  * High risk: -8 to -15 points
  * Medium risk: -3 to -8 points
  * Low risk: -1 to -3 points
- Add points for protective factors (written agreements, insurance, etc.)

RISK IDENTIFICATION FRAMEWORK:
For each life situation provided, identify the specific legal vulnerabilities a person in that situation commonly faces. Be SPECIFIC — not "you may have employment issues" but "without a written employment agreement, you have no protection against sudden termination without cause, and any verbal promises about salary or benefits are unenforceable."

STATE-SPECIFIC ANALYSIS:
Note when ${state} has specific laws that affect the risk level (e.g., California has stronger tenant protections, Texas is an at-will employment state with fewer protections, New York has strong wage theft laws).

Respond ONLY with valid JSON:
{
  "score": 68,
  "grade": "C",
  "summary": "Personalized 2-3 sentence summary referencing their specific situations and state",
  "topPriority": "The single most important legal action they should take right now",
  "risks": [
    {
      "category": "Employment",
      "title": "No Written Employment Agreement",
      "description": "Without a written contract, your employer can change your compensation, duties, or terminate you at any time without cause in ${state}",
      "severity": "high",
      "specificRisk": "If terminated, you have no written evidence of promised severance, benefits, or non-compete limitations",
      "actionLabel": "Request Written Agreement",
      "immediateAction": "Ask HR for a written offer letter or employment agreement confirming your role, salary, and key terms"
    }
  ],
  "strengths": [
    "As a tenant in ${state}, you have strong habitability protections under state law",
    "Federal wage laws protect you regardless of your employment agreement"
  ]
}

Generate 4-7 specific, personalized risks. Grade: A=90-100, B=75-89, C=60-74, D=45-59, F=0-44.`;

  const userPrompt = `Life situations: ${situations.join(", ")}
State: ${state}

Analyze this person's specific legal vulnerabilities and generate their personalized Legal Health Score.`;

  try {
    const response = await invokeLLM({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
    });

    const content = (response.choices[0]?.message?.content as string) ?? "{}";
    const parsed = JSON.parse(content);

    const validGrades = ["A", "B", "C", "D", "F"];
    const score = typeof parsed.score === "number" ? Math.min(100, Math.max(0, parsed.score)) : 65;

    return {
      score,
      grade: (validGrades.includes(parsed.grade) ? parsed.grade : "C") as "A" | "B" | "C" | "D" | "F",
      summary: parsed.summary ?? "Your legal health has been assessed.",
      topPriority: parsed.topPriority ?? "Review your key legal agreements and rights.",
      risks: ((parsed.risks ?? []) as any[]).slice(0, 7).map((r) => ({
        category: r.category ?? "General",
        title: r.title ?? "Legal Risk",
        description: r.description ?? "",
        severity: (["critical", "high", "medium", "low"].includes(r.severity) ? r.severity : "medium") as "critical" | "high" | "medium" | "low",
        specificRisk: r.specificRisk ?? r.description ?? "",
        actionLabel: r.actionLabel ?? "Learn More",
        immediateAction: r.immediateAction ?? "",
      })),
      strengths: ((parsed.strengths ?? []) as string[]).slice(0, 5),
      generatedAt: new Date().toISOString(),
    };
  } catch (err) {
    console.error("[LLM] Health score error:", err);
    throw new Error("Health score generation failed. Please try again.");
  }
}

async function generateSituationPlan(
  situationType: string,
  situationLabel: string,
  userDescription: string,
  state: string
): Promise<SituationPlanResult> {
  const systemPrompt = `You are PocketLawyer's Situation Wizard — a senior litigation attorney who has handled hundreds of cases involving ${situationType}. You are creating a personalized, expert-level action plan for someone facing this situation RIGHT NOW.

YOUR MANDATE:
Create the most useful, specific, and empowering action plan possible. This person is stressed and needs clarity. Give them:
1. The truth about their situation (don't sugarcoat, don't catastrophize)
2. Exactly what to do, in what order, with what timeframe
3. Their specific legal rights in ${state}
4. The critical mistakes to avoid
5. A realistic assessment of outcomes and costs

PLAN QUALITY STANDARDS:
- Each step must be SPECIFIC and ACTIONABLE — not "consult an attorney" but "contact a ${situationType} attorney for a free consultation; most offer free 30-minute consults; search your state bar's lawyer referral service"
- Include the LEGAL BASIS for key rights (e.g., "Under ${state}'s landlord-tenant law, your landlord must provide...")
- TIMEFRAMES must be specific: "Within 24 hours", "Before the court date", "Within 30 days of termination"
- RESOURCES should be real and useful: specific government agencies, legal aid organizations, official forms
- WARNING FLAGS should be the most common, costly mistakes people make in this situation

STATE-SPECIFIC ANALYSIS:
${state} has specific laws that may affect this situation. Reference them where relevant.

URGENCY ASSESSMENT:
- "immediate": Legal deadlines within 24-72 hours, criminal charges, imminent eviction enforcement
- "this_week": Court dates within 2 weeks, response deadlines, time-sensitive negotiations
- "this_month": Important but not emergency, planning phase
- "no_rush": Informational, preventive, or long-term planning

Respond ONLY with valid JSON:
{
  "urgencyLevel": "this_week",
  "overview": "2-3 sentence expert assessment of their specific situation and what it means legally",
  "legalContext": "1-2 sentences on the key legal framework that governs this situation in ${state}",
  "successProbability": "Honest assessment like: 'Strong case if you act quickly and document everything' or 'Outcome depends heavily on your specific facts'",
  "steps": [
    {
      "stepNumber": 1,
      "title": "Document Everything Immediately",
      "description": "Create a comprehensive written record before memories fade and evidence disappears",
      "action": "Write a detailed timeline of all events with dates, times, names, and what was said. Screenshot all relevant texts, emails, and documents. If physical evidence exists, photograph it now.",
      "timeframe": "Do this today — within the next 2 hours if possible",
      "priority": "urgent",
      "resources": ["Google Drive or Notes app for timeline", "Screenshot all digital communications", "Request copies of any signed agreements"],
      "legalBasis": "Documentation is critical because the burden of proof is on you to establish the facts"
    }
  ],
  "keyRights": [
    "Specific right 1 with legal basis",
    "Specific right 2 with legal basis"
  ],
  "warningFlags": [
    "CRITICAL: Do NOT sign anything without reading it completely — any agreement you sign waives your rights",
    "WARNING: Do not communicate with the other party without documenting every interaction"
  ],
  "estimatedCost": "Realistic range: $X-Y if self-represented, $X,000-Y,000 with an attorney",
  "shouldHireAttorney": true,
  "attorneyType": "Specific type of attorney (e.g., 'Employment attorney specializing in wrongful termination')",
  "statSpecificNote": "Key ${state}-specific law or protection that applies here"
}

Generate 5-8 steps. Make this plan genuinely useful — the kind of advice a knowledgeable friend who is also a lawyer would give.`;

  const userPrompt = `Situation: ${situationLabel} (${situationType})
State: ${state}
User's description: ${userDescription || "No additional details provided"}

Create a comprehensive, expert-level action plan for this person.`;

  try {
    const response = await invokeLLM({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
    });

    const content = (response.choices[0]?.message?.content as string) ?? "{}";
    const parsed = JSON.parse(content);

    const validUrgency = ["immediate", "this_week", "this_month", "no_rush"];

    return {
      urgencyLevel: (validUrgency.includes(parsed.urgencyLevel) ? parsed.urgencyLevel : "this_week") as SituationPlanResult["urgencyLevel"],
      overview: parsed.overview ?? "Your situation has been analyzed.",
      legalContext: parsed.legalContext ?? "",
      successProbability: parsed.successProbability ?? "",
      steps: ((parsed.steps ?? []) as any[]).slice(0, 8).map((s, i) => ({
        stepNumber: s.stepNumber ?? i + 1,
        title: s.title ?? `Step ${i + 1}`,
        description: s.description ?? "",
        action: s.action ?? "",
        timeframe: s.timeframe ?? "As soon as possible",
        priority: (["urgent", "high", "medium", "low"].includes(s.priority) ? s.priority : "medium") as "urgent" | "high" | "medium" | "low",
        resources: (s.resources ?? []) as string[],
        legalBasis: s.legalBasis,
      })),
      keyRights: ((parsed.keyRights ?? []) as string[]).slice(0, 6),
      warningFlags: ((parsed.warningFlags ?? []) as string[]).slice(0, 5),
      estimatedCost: parsed.estimatedCost ?? "Varies by complexity and representation",
      shouldHireAttorney: Boolean(parsed.shouldHireAttorney),
      attorneyType: parsed.attorneyType ?? "General practice attorney",
      statSpecificNote: parsed.statSpecificNote ?? "",
    };
  } catch (err) {
    console.error("[LLM] Situation plan error:", err);
    throw new Error("Situation plan generation failed. Please try again.");
  }
}

async function generateRightsCards(
  category: string,
  count: number
): Promise<RightsCard[]> {
  const systemPrompt = `You are PocketLawyer's Know Your Rights AI — a legal educator who specializes in making complex legal rights accessible and memorable.

YOUR TASK: Generate ${count} genuinely surprising, empowering, and immediately useful legal rights cards for the category: ${category}.

CARD QUALITY STANDARDS:
- SURPRISING: Focus on rights people DON'T know they have — not obvious ones
- SPECIFIC: Cite the actual law or standard (e.g., "Under the FDCPA...", "The 4th Amendment protects...", "Most states require...")
- ACTIONABLE: Each card must end with something the person can DO with this knowledge
- MEMORABLE: Write in a way that sticks — use specific numbers, timeframes, dollar amounts
- ACCURATE: Only state rights that are actually legally established

EXAMPLES OF GREAT CARDS:
- "You can dispute a debt in writing within 30 days and the collector MUST stop contacting you (FDCPA §809)"
- "Your employer cannot retaliate against you for discussing your salary with coworkers — it's protected by the NLRA"
- "Police need a warrant to search your phone, even after arrest (Riley v. California, 2014 Supreme Court)"

Respond ONLY with valid JSON object containing a "cards" array:
{
  "cards": [
    {
      "id": "category_001",
      "category": "${category}",
      "title": "Punchy, memorable title (max 8 words)",
      "content": "2-3 sentences explaining the right clearly, with specific legal basis and what it means practically",
      "emoji": "relevant emoji",
      "legalBasis": "Specific law, statute, or case (e.g., FLSA §207, 4th Amendment, Riley v. California)",
      "actionableStep": "One specific thing you can do with this knowledge right now"
    }
  ]
}`;

  const userPrompt = `Generate ${count} powerful Know Your Rights cards for: ${category}. Focus on the most surprising and valuable rights in this category.`;

  try {
    const response = await invokeLLM({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
    });

    const content = (response.choices[0]?.message?.content as string) ?? "{}";
    let parsed: any;
    try { parsed = JSON.parse(content); } catch { return []; }

    const cards = Array.isArray(parsed) ? parsed : (parsed.cards ?? parsed.items ?? []);

    return ((cards ?? []) as any[]).slice(0, count).map((c, i) => ({
      id: c.id ?? `${category.toLowerCase().replace(/\s+/g, "_")}_${i + 1}`,
      category: c.category ?? category,
      title: c.title ?? "Know Your Rights",
      content: c.content ?? "",
      emoji: c.emoji ?? "⚖️",
      legalBasis: c.legalBasis ?? "",
      actionableStep: c.actionableStep ?? "",
    }));
  } catch (err) {
    console.error("[LLM] Rights cards error:", err);
    throw new Error("Rights cards generation failed.");
  }
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const appRouter = router({
  system: systemRouter,

  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  legal: router({
    /**
     * Ask a legal question with expert-level AI response, follow-up suggestions, and urgency detection.
     */
    ask: publicProcedure
      .input(
        z.object({
          question: z.string().min(1).max(2000),
          conversationHistory: z
            .array(
              z.object({
                role: z.enum(["user", "assistant"]),
                content: z.string(),
              })
            )
            .optional()
            .default([]),
        })
      )
      .mutation(async ({ input }) => {
        return askLegalQuestion(input.question, input.conversationHistory);
      }),

    /**
     * Deep document analysis with risk scoring, party favorability, and negotiation leverage.
     */
    analyzeDocument: publicProcedure
      .input(
        z.object({
          documentName: z.string().min(1).max(255),
          text: z.string().min(10).max(50000),
        })
      )
      .mutation(async ({ input }) => {
        return analyzeDocument(input.text, input.documentName);
      }),

    /**
     * Comprehensive legal topic guide with rights, deadlines, and resources.
     */
    getTopicInfo: publicProcedure
      .input(
        z.object({
          topic: z.string().min(1).max(100),
        })
      )
      .query(async ({ input }) => {
        const info = await getLegalTopicInfo(input.topic);
        return { topic: input.topic, info };
      }),

    /**
     * Personalized Legal Health Score with state-specific risk analysis and immediate action priorities.
     */
    generateHealthScore: publicProcedure
      .input(
        z.object({
          situations: z.array(z.string()).min(1).max(10),
          state: z.string().min(2).max(2),
        })
      )
      .mutation(async ({ input }) => {
        return generateLegalHealthScore(input.situations, input.state);
      }),

    /**
     * Expert step-by-step action plan for a specific legal situation with state law, rights, and cost estimates.
     */
    generateSituationPlan: publicProcedure
      .input(
        z.object({
          situationType: z.string().min(1).max(100),
          situationLabel: z.string().min(1).max(200),
          userDescription: z.string().min(0).max(2000).default(""),
          state: z.string().min(2).max(2),
        })
      )
      .mutation(async ({ input }) => {
        return generateSituationPlan(
          input.situationType,
          input.situationLabel,
          input.userDescription,
          input.state
        );
      }),

    /**
     * Surprising, specific Know Your Rights cards with legal basis and actionable steps.
     */
    generateRightsCards: publicProcedure
      .input(
        z.object({
          category: z.string().min(1).max(100),
          count: z.number().min(1).max(10).default(5),
        })
      )
      .mutation(async ({ input }) => {
        const cards = await generateRightsCards(input.category, input.count);
        return { cards };
      }),
  }),
});

export type AppRouter = typeof appRouter;
