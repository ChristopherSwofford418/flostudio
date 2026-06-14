import { z } from "zod";
import { COOKIE_NAME } from "../shared/const.js";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { invokeLLM } from "./_core/llm";
import { storagePut } from "./storage";

// ─── Types (mirrored from lib/scan-store.ts) ──────────────────────────────────
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

// ─── PDF text extraction (server-side) ────────────────────────────────────────
async function extractTextFromBase64PDF(base64: string): Promise<string> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParse = require("pdf-parse") as (buf: Buffer) => Promise<{ text: string }>;
    const buffer = Buffer.from(base64, "base64");
    const data = await pdfParse(buffer);
    return data.text ?? "";
  } catch (err) {
    console.error("[PDF] Extraction error:", err);
    return "";
  }
}

// ─── AI citation verification ─────────────────────────────────────────────────
async function verifyCitationsWithAI(
  documentText: string,
  documentName: string
): Promise<ScanResult> {
  const systemPrompt = `You are a legal citation verification expert. Analyze the document and verify every legal citation you find.

For each citation, determine:
1. Whether it is a real, verifiable legal citation (case, statute, regulation, law review, etc.)
2. Confidence level (0–100) that the citation is accurate
3. A clear verdict explaining your finding
4. A suggested correction if the citation appears wrong

Status rules:
- "valid": Citation appears real and correctly formatted (confidence ≥ 75)
- "warning": Citation may exist but has formatting issues or uncertain details (confidence 40–74)
- "invalid": Citation appears fabricated, hallucinated, or non-existent (confidence < 40)

Respond ONLY with valid JSON:
{
  "citations": [
    {
      "id": "1",
      "text": "exact citation text from document",
      "status": "valid|warning|invalid",
      "confidence": 95,
      "sourceUrl": "https://... (only if you know a real, verifiable URL)",
      "verdict": "Explanation of verification result",
      "suggestedFix": "Corrected citation if needed (omit if valid)"
    }
  ]
}`;

  const userPrompt = `Verify all legal citations in the following document. Extract every citation (cases, statutes, regulations, law review articles, secondary sources) and verify each one.

Document: ${documentName}

Text:
${documentText.substring(0, 10000)}`;

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
    const citations: Citation[] = (parsed.citations ?? []).map(
      (c: any, i: number) => ({
        id: String(i + 1),
        text: c.text ?? "",
        status: (["valid", "warning", "invalid"].includes(c.status)
          ? c.status
          : "warning") as CitationStatus,
        confidence: Math.min(100, Math.max(0, Number(c.confidence) || 50)),
        sourceUrl: c.sourceUrl || undefined,
        verdict: c.verdict ?? "Unable to verify",
        suggestedFix: c.suggestedFix || undefined,
      })
    );

    return {
      id: Date.now().toString(),
      documentName,
      createdAt: new Date().toISOString(),
      citations,
      totalCount: citations.length,
      validCount: citations.filter((c) => c.status === "valid").length,
      warningCount: citations.filter((c) => c.status === "warning").length,
      invalidCount: citations.filter((c) => c.status === "invalid").length,
    };
  } catch (err) {
    console.error("[LLM] Citation verification error:", err);
    throw new Error("Citation verification failed. Please try again.");
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

  citations: router({
    /**
     * Verify citations from pasted text.
     * Content is the raw document text (max 50,000 chars).
     */
    verifyText: publicProcedure
      .input(
        z.object({
          documentName: z.string().min(1).max(255),
          content: z.string().min(10).max(50000),
        })
      )
      .mutation(async ({ input }) => {
        return verifyCitationsWithAI(input.content, input.documentName);
      }),

    /**
     * Verify citations from a base64-encoded PDF file.
     * The client reads the file with expo-file-system and sends base64.
     * Server extracts text with pdf-parse, then runs AI verification.
     */
    verifyFile: publicProcedure
      .input(
        z.object({
          documentName: z.string().min(1).max(255),
          // base64-encoded file content (PDF, TXT; DOCX falls back to raw text)
          base64: z.string().min(10),
          mimeType: z.string(),
        })
      )
      .mutation(async ({ input }) => {
        let text = "";

        if (input.mimeType === "application/pdf") {
          text = await extractTextFromBase64PDF(input.base64);
        } else {
          // TXT and plain DOCX — decode base64 as UTF-8 text
          text = Buffer.from(input.base64, "base64").toString("utf-8");
        }

        if (!text || text.trim().length < 20) {
          throw new Error(
            "Could not extract readable text from this file. Please try pasting the text directly."
          );
        }

        return verifyCitationsWithAI(text, input.documentName);
      }),
  }),
});

export type AppRouter = typeof appRouter;
