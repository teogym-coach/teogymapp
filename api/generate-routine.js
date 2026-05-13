// Vercel 서버리스 함수 — /api/generate-routine
// 프론트엔드 대신 서버에서 Anthropic API 호출
// Vercel 환경변수: ANTHROPIC_API_KEY

export default async function handler(req, res) {
  // CORS 헤더
  res.setHeader("Access-Control-Allow-Origin",  "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // API 키 확인
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: "API_KEY_MISSING",
      message: "ANTHROPIC_API_KEY 환경변수가 설정되지 않았습니다. Vercel 대시보드 → Settings → Environment Variables에서 추가해주세요.",
    });
  }

  const { prompt } = req.body || {};
  if (!prompt) {
    return res.status(400).json({
      error: "NO_PROMPT",
      message: "요청 데이터가 부족합니다. (prompt 필드 없음)",
    });
  }

  try {
    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type":         "application/json",
        "x-api-key":            apiKey,
        "anthropic-version":    "2023-06-01",
      },
      body: JSON.stringify({
        model:      "claude-sonnet-4-20250514",
        max_tokens: 1600,
        messages:   [{ role: "user", content: prompt }],
      }),
    });

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text();
      console.error("[generate-routine] Anthropic API error:", anthropicRes.status, errText);
      return res.status(502).json({
        error:   "AI_API_FAILED",
        message: `AI API 응답 실패 (${anthropicRes.status})`,
        detail:  errText,
      });
    }

    const data = await anthropicRes.json();
    const text = (data.content || []).map(c => c.text || "").join("").trim();
    return res.status(200).json({ text });

  } catch (e) {
    console.error("[generate-routine] Network error:", e.message);
    return res.status(503).json({
      error:   "NETWORK_ERROR",
      message: "서버에서 AI API에 연결하지 못했습니다: " + e.message,
    });
  }
}
