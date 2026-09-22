import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

type ClaimedDocument = {
  id: string;
  family_id: string;
  student_id: string | null;
  storage_path: string;
  original_name: string;
  mime_type: string;
  size_bytes: number;
};

type Extraction = {
  raw_text: string;
  summary: string;
  candidates: Array<{
    candidate_type: "academic_item" | "calendar_event" | "material" | "payment" | "note";
    academic_type: "task" | "test" | "exam" | "project" | "material" | "school_event";
    title: string;
    description: string;
    starts_at: string;
    due_at: string;
    subject: string;
    priority: "low" | "normal" | "high" | "urgent";
    materials: string[];
    confidence: number;
  }>;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function toBase64(bytes: Uint8Array) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length)));
  }
  return btoa(binary);
}

function outputText(payload: any): string | null {
  if (typeof payload?.output_text === "string") return payload.output_text;
  for (const item of payload?.output ?? []) {
    if (item?.type !== "message") continue;
    for (const content of item?.content ?? []) {
      if (content?.type === "output_text" && typeof content.text === "string") return content.text;
    }
  }
  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const openAiKey = Deno.env.get("OPENAI_API_KEY");
  const model = Deno.env.get("AFTER_OCR_MODEL") ?? "gpt-5.6-luna";
  const authorization = req.headers.get("Authorization") ?? "";

  if (!supabaseUrl || !anonKey || !serviceRoleKey || !authorization) {
    return json({ error: "server_configuration" }, 500);
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let documentId = "";
  try {
    const body = await req.json();
    documentId = typeof body?.documentId === "string" ? body.documentId : "";
    if (!documentId) return json({ error: "document_required" }, 400);

    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData.user) return json({ error: "unauthorized" }, 401);

    const { data: claimData, error: claimError } = await userClient.rpc(
      "after_claim_source_document_for_ocr",
      { p_document_id: documentId },
    );
    if (claimError || !claimData) return json({ error: "document_not_available" }, 403);

    const document = claimData as ClaimedDocument;
    if (!document.student_id) {
      await userClient.rpc("after_mark_ocr_failed", {
        p_document_id: documentId,
        p_error: "El documento debe estar asociado a un alumno antes de procesarlo.",
      });
      return json({ error: "student_required" }, 400);
    }

    if (!openAiKey) {
      await userClient.rpc("after_mark_ocr_failed", {
        p_document_id: documentId,
        p_error: "OCR pendiente de configurar en el servidor.",
      });
      return json({ error: "ocr_provider_not_configured" }, 503);
    }

    const { data: blob, error: downloadError } = await adminClient.storage
      .from("after-source-documents")
      .download(document.storage_path);
    if (downloadError || !blob) throw new Error("No fue posible leer el archivo privado.");

    const bytes = new Uint8Array(await blob.arrayBuffer());
    if (bytes.length === 0 || bytes.length > 8 * 1024 * 1024) throw new Error("Tamaño de archivo inválido.");

    const base64 = toBase64(bytes);
    const fileInput = document.mime_type.startsWith("image/")
      ? { type: "input_image", image_url: `data:${document.mime_type};base64,${base64}`, detail: "high" }
      : { type: "input_file", filename: document.original_name, file_data: base64 };

    const today = new Date().toISOString();
    const prompt = [
      "Lee este documento enviado por un colegio y extrae únicamente información explícita.",
      `Fecha de referencia UTC: ${today}.`,
      "No inventes fechas, asignaturas, materiales ni instrucciones. Si falta un dato, usa cadena vacía.",
      "Detecta tareas, pruebas, exámenes, proyectos, materiales solicitados y eventos escolares.",
      "Para fechas relativas como 'mañana' o 'este viernes', resuélvelas usando la fecha de referencia solo cuando el texto sea inequívoco.",
      "Usa ISO 8601 con zona horaria -03:00 cuando exista fecha/hora; si solo hay fecha, usa 18:00 para tareas académicas y 08:00 para eventos únicamente cuando el documento no dé una hora. Marca menor confianza en esos casos.",
      "Los materiales deben quedar asociados al candidato académico correspondiente cuando sea posible.",
      "Los pagos, notas informativas o contenido que no deba crear automáticamente una tarea/evento se clasifican como payment o note.",
      "Devuelve el texto OCR legible, un resumen breve y candidatos para revisión humana. Nada se publica automáticamente.",
    ].join("\n");

    const aiResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openAiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        store: false,
        max_output_tokens: 6000,
        input: [{
          role: "user",
          content: [fileInput, { type: "input_text", text: prompt }],
        }],
        text: {
          format: {
            type: "json_schema",
            name: "after_school_document",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              required: ["raw_text", "summary", "candidates"],
              properties: {
                raw_text: { type: "string" },
                summary: { type: "string" },
                candidates: {
                  type: "array",
                  maxItems: 30,
                  items: {
                    type: "object",
                    additionalProperties: false,
                    required: [
                      "candidate_type", "academic_type", "title", "description", "starts_at",
                      "due_at", "subject", "priority", "materials", "confidence",
                    ],
                    properties: {
                      candidate_type: { type: "string", enum: ["academic_item", "calendar_event", "material", "payment", "note"] },
                      academic_type: { type: "string", enum: ["task", "test", "exam", "project", "material", "school_event"] },
                      title: { type: "string" },
                      description: { type: "string" },
                      starts_at: { type: "string" },
                      due_at: { type: "string" },
                      subject: { type: "string" },
                      priority: { type: "string", enum: ["low", "normal", "high", "urgent"] },
                      materials: { type: "array", items: { type: "string" }, maxItems: 20 },
                      confidence: { type: "number", minimum: 0, maximum: 1 },
                    },
                  },
                },
              },
            },
          },
        },
      }),
    });

    if (!aiResponse.ok) {
      const providerError = await aiResponse.text();
      console.error("after-school-ocr provider error", aiResponse.status, providerError.slice(0, 500));
      throw new Error(`El proveedor OCR respondió ${aiResponse.status}.`);
    }

    const payload = await aiResponse.json();
    const text = outputText(payload);
    if (!text) throw new Error("El OCR no devolvió contenido estructurado.");

    const extraction = JSON.parse(text) as Extraction;
    const rawText = (extraction.raw_text || extraction.summary || "").slice(0, 50000);
    const candidates = Array.isArray(extraction.candidates) ? extraction.candidates : [];

    const { data: savedCount, error: saveError } = await userClient.rpc("after_save_ocr_result", {
      p_document_id: documentId,
      p_ocr_text: rawText,
      p_provider: `openai:${model}`,
      p_candidates: candidates,
    });
    if (saveError) throw new Error("No fue posible guardar la revisión OCR.");

    return json({
      ok: true,
      documentId,
      candidateCount: Number(savedCount ?? candidates.length),
      summary: extraction.summary?.slice(0, 500) ?? "",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No fue posible procesar el documento.";
    console.error("after-school-ocr", message);
    if (documentId) {
      await userClient.rpc("after_mark_ocr_failed", {
        p_document_id: documentId,
        p_error: message,
      });
    }
    return json({ error: "ocr_failed", message }, 500);
  }
});
