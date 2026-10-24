// supabase/functions/analyze-hair/index.ts
import { createClient } from "npm:@supabase/supabase-js@2";
import { encodeBase64 } from "jsr:@std/encoding/base64";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Free Google Gemini model. "flash-latest" always points to the newest free Flash model.
// If you get a 404, copy an exact model name from https://aistudio.google.com
const MODEL = "gemini-flash-latest";
const DAILY_LIMIT = 2; // scans per user per 24h (simple abuse/cost guard)

const RUBRIC = `You are a hair photo analysis assistant inside a hair care app.
You give visual ESTIMATES only. You are not a doctor and never diagnose.

Score each item from 0 to 10, where HIGHER IS ALWAYS BETTER:
- density: how full/thick the hair looks overall (0 = very sparse, 10 = very full)
- scalp_coverage: how well hair covers the scalp (0 = scalp very visible, 10 = scalp not visible)
- shine: how healthy/shiny the hair looks (0 = very dull, 10 = very glossy)
- integrity: lack of visible breakage, frizz or damage (0 = lots of damage, 10 = none visible)

Rules:
- Judge only what is visible. Lighting and angle affect results, so be conservative.
- If the photo is not a clear photo of hair/scalp, set "usable" to false and explain in "notes".
- Also set "usable" to false if the photo is too dark, blurry, overexposed, or has strong glare or shadows that hide the hair or scalp. In "photo_tips", say exactly how to fix it (for example: "Face a window and turn the flash off", or "Hold the phone steady and closer to your parting").
- "notes": 1-2 short, encouraging, practical sentences. No medical claims, no diagnosis.
- "photo_tips": one short tip to get a better comparable photo next time.

Reply with ONLY valid JSON, no markdown, in exactly this shape:
{"usable": true, "density": 0, "scalp_coverage": 0, "shine": 0, "integrity": 0, "notes": "", "photo_tips": ""}`;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const clamp = (n: unknown) =>
  Math.max(0, Math.min(10, Math.round(Number(n) || 0)));

Deno.serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });

  try {
    // 1. Who is calling? (uses the user's own login token)
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Not signed in" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData.user) return json({ error: "Not signed in" }, 401);
    const user = userData.user;

    // 2. Validate the request
    const { path } = await req.json();
    if (typeof path !== "string" || !path.startsWith(`${user.id}/`)) {
      return json({ error: "Invalid photo path" }, 400);
    }

    // 3. Plan check: the AI hair check is a Plus feature.
    // Checked here (not just in the app) so it can't be bypassed.
    const { data: planRow } = await supabase
      .from("user_plans")
      .select("plan, expires_at")
      .maybeSingle();
    const planExpired = planRow?.expires_at
      ? new Date(planRow.expires_at).getTime() < Date.now()
      : false;
    const isPaid = !planExpired && planRow?.plan === "plus";
    if (!isPaid) {
      return json(
        { error: "AI hair check is a Plus feature.", code: "plan_required" },
        403,
      );
    }

    // 3b. Rate limit: 2 AI hair checks per rolling 30 days.
    // Only saved scans count, so an unusable photo can be retaken for free.
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data: recent } = await supabase
      .from("scans")
      .select("created_at")
      .eq("user_id", user.id)
      .gte("created_at", since)
      .order("created_at", { ascending: true });
    if ((recent?.length ?? 0) >= MONTHLY_LIMIT) {
      const next = new Date(
        new Date(recent![0].created_at).getTime() + 30 * 24 * 60 * 60 * 1000,
      );
      const when = next.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      });
      return json(
        {
          error: `You've used your ${MONTHLY_LIMIT} AI hair checks for this month. Your next one is available on ${when}.`,
          code: "limit_reached",
        },
        429,
      );
    }

    // 4. Download the photo (storage policies make sure it's theirs)
    const { data: blob, error: dlErr } = await supabase.storage
      .from("hair-photos")
      .download(path);
    if (dlErr || !blob) return json({ error: "Could not read photo" }, 400);

    const imageBytes = new Uint8Array(await blob.arrayBuffer());
    if (imageBytes.length < 1000) {
      console.error(
        "Photo is empty or too small. Bytes:",
        imageBytes.length,
        "path:",
        path,
      );
      return json({ error: "Photo upload was empty, please try again." }, 400);
    }
    const base64 = encodeBase64(imageBytes);
    const mediaType =
      blob.type && blob.type.startsWith("image/") ? blob.type : "image/jpeg";

    // 5. Ask the vision LLM (Google Gemini, free tier)
    const geminiBody = JSON.stringify({
      systemInstruction: { parts: [{ text: RUBRIC }] },
      contents: [
        {
          role: "user",
          parts: [
            { inlineData: { mimeType: mediaType, data: base64 } },
            { text: "Analyze this hair photo. Return JSON only." },
          ],
        },
      ],
      generationConfig: {
        temperature: 0,
        responseMimeType: "application/json",
        // Generous: newer Gemini models "think" first and thinking uses this budget too
        maxOutputTokens: 4096,
      },
    });

    const callGemini = () =>
      fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
        {
          method: "POST",
          headers: {
            "x-goog-api-key": Deno.env.get("GEMINI_API_KEY")!,
            "content-type": "application/json",
          },
          body: geminiBody,
        },
      );

    let llmRes = await callGemini();
    // Free-tier models are sometimes briefly overloaded (500/503): retry once
    if (llmRes.status === 500 || llmRes.status === 503) {
      await new Promise((r) => setTimeout(r, 1500));
      llmRes = await callGemini();
    }

    if (!llmRes.ok) {
      console.error("LLM error", llmRes.status, await llmRes.text());
      const msg =
        llmRes.status === 429
          ? "We're busy right now, please try again in a minute."
          : "Analysis failed, please try again";
      return json({ error: msg }, llmRes.status === 429 ? 429 : 502);
    }

    const llmData = await llmRes.json();
    const text: string = (llmData.candidates?.[0]?.content?.parts ?? [])
      .map((p: any) => p.text ?? "")
      .join("");

    // 6. Parse + validate the JSON
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end === -1) {
      console.error(
        "Bad LLM output. finishReason:",
        llmData.candidates?.[0]?.finishReason,
        "promptFeedback:",
        JSON.stringify(llmData.promptFeedback ?? null),
        "text:",
        text.slice(0, 300),
      );
      return json({ error: "Bad analysis result" }, 502);
    }

    let parsed: any;
    try {
      parsed = JSON.parse(text.slice(start, end + 1));
    } catch {
      console.error("Unparseable LLM output:", text.slice(0, 300));
      return json({ error: "Bad analysis result" }, 502);
    }

    // Photo not usable: tell the app, don't save or count it
    if (parsed.usable === false) {
      return json({
        usable: false,
        notes: String(parsed.notes ?? "We couldn't see your hair clearly."),
        photo_tips: String(parsed.photo_tips ?? ""),
      });
    }

    const density = clamp(parsed.density);
    const scalp_coverage = clamp(parsed.scalp_coverage);
    const shine = clamp(parsed.shine);
    const integrity = clamp(parsed.integrity);
    // Overall is computed here (not by the LLM) so it's consistent
    const overall = Math.round(
      (density + scalp_coverage + shine + integrity) / 4,
    );
    const notes = String(parsed.notes ?? "").slice(0, 500);
    const photo_tips = String(parsed.photo_tips ?? "").slice(0, 300);

    // 7. Save the scan
    const { data: row, error: insErr } = await supabase
      .from("scans")
      .insert({
        user_id: user.id,
        photo_path: path,
        density,
        scalp_coverage,
        shine,
        integrity,
        overall,
        notes,
        photo_tips,
      })
      .select()
      .single();

    if (insErr) {
      console.error("Insert error", insErr);
      return json({ error: "Could not save result" }, 500);
    }

    // 8. Send the result back to the app
    return json({ usable: true, scan: row });
  } catch (e) {
    console.error(e);
    return json({ error: "Something went wrong" }, 500);
  }
});
