async function geminiAnalyse(signal, candles) {
  const last5 = candles.slice(-5).map(c =>
    `O:${c.open} H:${c.high} L:${c.low} C:${c.close}`
  ).join(" | ");

  const prompt = `You are an expert forex trader analysing ${signal.pair} on 1-minute chart.
RSI: ${signal.rsi} | MACD: ${signal.macdHist} | EMA: ${signal.emaCross}
Stoch: ${signal.stoch} | ADX: ${signal.adx} | Bull: ${signal.bullScore}% | Bear: ${signal.bearScore}%
Buyers: ${signal.buyers}% | Sellers: ${signal.sellers}% | VWAP: ${signal.priceVwap}
Pattern: ${signal.pattern} | Last 5 candles: ${last5}
Respond ONLY valid JSON no markdown:
{"overall":"BUY","bias":"BULL","confidence":82,"reason":"one sentence","candle1":{"direction":"BULL","probability":82},"candle2":{"direction":"BULL","probability":68},"candle3":{"direction":"DOJI","probability":55},"risk":"LOW","entry":"NOW"}`;

  const key = CONFIG.GEMINI_KEY;
  if (!key || key === "YOUR_GEMINI_KEY") {
    throw new Error("No Gemini key");
  }

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 300 }
      })
    }
  );

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  const clean = text.replace(/```json|```/g, "").trim();
  return JSON.parse(clean);
}
