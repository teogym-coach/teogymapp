// Vercel 서버리스 함수 — /api/generate-routine
// 환경변수: ANTHROPIC_API_KEY (Vercel Dashboard > Settings > Environment Variables)

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin",  "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;

  // 키 없음
  if (!apiKey) {
    return res.status(500).json({
      error:   "API_KEY_MISSING",
      message: "ANTHROPIC_API_KEY 환경변수가 설정되지 않았습니다.",
    });
  }

  // 키 형식 검사 (Anthropic 키는 sk-ant- 로 시작)
  if (!apiKey.startsWith("sk-ant-")) {
    return res.status(500).json({
      error:   "API_KEY_INVALID_FORMAT",
      message: "API 키 형식이 잘못되었습니다. Anthropic 키는 sk-ant-로 시작해야 합니다. (현재 값의 앞 6자리: " + apiKey.slice(0, 6) + "...)",
    });
  }

  const { prompt } = req.body || {};
  if (!prompt) {
    return res.status(400).json({
      error:   "NO_PROMPT",
      message: "요청 데이터가 부족합니다.",
    });
  }

  try {
    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type":      "application/json",
        "x-api-key":         apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model:      "claude-sonnet-4-20250514",
        max_tokens: 1600,
        messages:   [{ role: "user", content: prompt }],
      }),
    });

    if (!anthropicRes.ok) {
      const errBody = await anthropicRes.json().catch(() => ({}));
      const status  = anthropicRes.status;

      // 상태 코드별 메시지 구분
      let message = `AI API 오류 (${status})`;
      if (status === 401) {
        message = "API 키가 유효하지 않습니다. Vercel 환경변수에 올바른 ANTHROPIC_API_KEY 값을 설정하고 재배포해주세요.";
      } else if (status === 429) {
        message = "API 요청 한도 초과입니다. 잠시 후 다시 시도해주세요.";
      } else if (status === 400) {
        message = "잘못된 요청입니다: " + (errBody.error?.message || "");
      } else if (status >= 500) {
        message = "Anthropic 서버 오류입니다. 잠시 후 다시 시도해주세요.";
      }

      console.error("[generate-routine]", status, errBody.error?.message || "");
      return res.status(502).json({ error: "AI_API_FAILED", message });
    }

    const data = await anthropicRes.json();
    const text = (data.content || []).map(c => c.text || "").join("").trim();
    return res.status(200).json({ text });

  } catch (e) {
    console.error("[generate-routine] fetch error:", e.message);
    return res.status(503).json({
      error:   "NETWORK_ERROR",
      message: "AI 서버 연결 실패: " + e.message,
    });
  }
}
