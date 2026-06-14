import { z } from "zod";
import { COOKIE_NAME } from "../shared/const.js";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { invokeLLM } from "./_core/llm";

// Types mirrored from lib/scan-store.ts
type CitationStatus = "valid" | "warning" | "invalid";
interface Citation {
  id: string;
  text: string;
  status: CitationStatus;
  confidence: number;
  sourceUrl?: string;
  verdict: string;
  suggestedFix?: string;
}

interface ScanResult {
  id: string;
  documentName: string;
  createdAt: string;
  citations: Citation[];
  totalCount: number;
  validCount: number;
  warningCount: number;
  invalidCount: number;
}

async function verifyCitationsWithAI(documentText: string, documentName: string): Promise<ScanResult> {
  const systemPrompt = `You are a legal citation verification expert. Your job is to analyze legal documents and verify each citation.

For each citation found, determine:
1. Whether it is a real, verifiable legal citation (case, statute, regulation, etc.)
2. The confidence level (0-100) that the citation is accurate
3. A verdict explaining your finding
4. A suggested fix if the citation appears incorrect

Citation status rules:
- "valid": Citation appears real and correctly formatted (confidence >= 75)
- "warning": Citation may exist but has formatting issues or uncertain details (confidence 40-74)
- "invalid": Citation appears fabricated, hallucinated, or does not exist (confidence < 40)

Respond ONLY with valid JSON in this exact format:
{
  "citations": [
    {
      "id": "1",
      "text": "exact citation text from document",
      "status": "valid|warning|invalid",
      "confidence": 95,
      "sourceUrl": "https://... (only if you know a real URL)",
      "verdict": "Explanation of verification result",
      "suggestedFix": "Corrected citation if needed (omit if valid)"
    }
  ]
}`;

  const userPrompt = `Please verify all legal citations in the following document text. Extract every citation you find (cases, statutes, regulations, law review articles, etc.) and verify each one.

Document: ${documentName}

Text:
${documentText.substring(0, 8000)}`;

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
    const citations: Citation[] = (parsed.citations ?? []).map((c: any, i: number) => ({
      id: String(i + 1),
      text: c.text ?? "",
      status: (["valid", "warning", "invalid"].includes(c.status) ? c.status : "warning") as CitationStatus,
      confidence: Math.min(100, Math.max(0, Number(c.confidence) || 50)),
      sourceUrl: c.sourceUrl || undefined,
      verdict: c.verdict ?? "Unable to verify",
      suggestedFix: c.suggestedFix || undefined,
    }));

    const scanResult: ScanResult = {
      id: Date.now().toString(),
      documentName,
      createdAt: new Date().toISOString(),
      citations,
      totalCount: citations.length,
      validCount: citations.filter((c) => c.status === "valid").length,
      warningCount: citations.filter((c) => c.status === "warning").length,
      invalidCount: citations.filter((c) => c.status === "invalid").length,
    };

    return scanResult;
  } catch (err) {
    console.error("LLM citation verification error:", err);
    throw new Error("Citation verification failed");
  }
}

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

  citations: router({
    verify: publicProcedure
      .input(
        z.object({
          documentName: z.string().min(1).max(255),
          content: z.string().min(10).max(50000),
          mode: z.enum(["file", "paste"]),
        })
      )
      .mutation(async ({ input }) => {
        return verifyCitationsWithAI(input.content, input.documentName);
      }),
  }),
});

export type AppRouter = typeof appRouter;
