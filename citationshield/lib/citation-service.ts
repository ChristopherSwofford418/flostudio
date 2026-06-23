/**
 * Client-side citation verification service.
 *
 * Calls the Manus Forge API directly from the mobile client,
 * eliminating the need for a backend server URL.
 *
 * Uses EXPO_PUBLIC_FORGE_API_URL and EXPO_PUBLIC_FORGE_API_KEY
 * which are baked into the app bundle at build time.
 */
import type { ScanResult, CitationStatus, Citation } from "./scan-store";

const FORGE_API_URL =
  process.env.EXPO_PUBLIC_FORGE_API_URL ?? "https://forge.manus.ai";
const FORGE_API_KEY = process.env.EXPO_PUBLIC_FORGE_API_KEY ?? "";

const SYSTEM_PROMPT = `You are a legal citation verification expert. Analyze the document and verify every legal citation you find.
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

/**
 * Verify citations from plain text content.
 */
export async function verifyCitationsFromText(
  documentText: string,
  documentName: string
): Promise<ScanResult> {
  const userPrompt = `Verify all legal citations in the following document. Extract every citation (cases, statutes, regulations, law review articles, secondary sources) and verify each one.
Document: ${documentName}
Text:
${documentText.substring(0, 10000)}`;

  return callForgeForCitations([
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: userPrompt },
  ], documentName);
}

/**
 * Verify citations from a base64-encoded file.
 * For PDFs: sends as file_url to the Forge multimodal API.
 * For TXT/DOCX: decodes to text and verifies as text.
 */
export async function verifyCitationsFromFile(
  base64: string,
  mimeType: string,
  documentName: string
): Promise<ScanResult> {
  if (mimeType === "application/pdf") {
    // Use Forge multimodal API with inline base64 PDF
    const dataUrl = `data:application/pdf;base64,${base64}`;
    const userPrompt = `Verify all legal citations in the attached PDF document named "${documentName}". Extract every citation (cases, statutes, regulations, law review articles, secondary sources) and verify each one.`;

    return callForgeForCitations([
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          {
            type: "file_url",
            file_url: {
              url: dataUrl,
              mime_type: "application/pdf",
            },
          },
          { type: "text", text: userPrompt },
        ],
      },
    ], documentName);
  } else {
    // TXT, DOCX — decode base64 to text
    const text = decodeBase64ToText(base64);
    return verifyCitationsFromText(text, documentName);
  }
}

async function callForgeForCitations(
  messages: any[],
  documentName: string
): Promise<ScanResult> {
  const response = await fetch(`${FORGE_API_URL}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${FORGE_API_KEY}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages,
      response_format: { type: "json_object" },
      max_tokens: 4096,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "Unknown error");
    throw new Error(`Citation verification failed (${response.status}). Please check your connection and try again.`);
  }

  const data = await response.json();
  const content = (data.choices?.[0]?.message?.content as string) ?? "{}";

  let parsed: { citations?: any[] };
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error("Citation verification returned invalid data. Please try again.");
  }

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
}

/**
 * Decode a base64 string to UTF-8 text (for TXT/DOCX files).
 */
export function decodeBase64ToText(base64: string): string {
  try {
    return decodeURIComponent(
      Array.from(atob(base64))
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    );
  } catch {
    try {
      return atob(base64);
    } catch {
      return base64;
    }
  }
}
