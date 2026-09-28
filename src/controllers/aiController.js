const Groq = require('groq-sdk');
const { toolDefinitions, runTool, storePolicies } = require('../services/aiTools');

const MODEL = 'openai/gpt-oss-120b';
const MAX_TOOL_ROUNDS = 6; // Safety cap on search -> act -> confirm loops
const MAX_HISTORY = 12; // Recent chat turns sent as context
const MAX_RETRIES = 2; // Groq rejects malformed tool calls (tool_use_failed); retrying usually succeeds

// The chat window renders plain text and "- " bullets, so strip markdown emphasis and headings
const toPlainText = (text) =>
  text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/[ \t]+$/gm, '')
    .trim();

const complete = async (groq, params) => {
  for (let attempt = 0; ; attempt++) {
    try {
      return await groq.chat.completions.create(params);
    } catch (error) {
      const toolUseFailed =
        error?.status === 400 &&
        (error?.error?.error?.code === 'tool_use_failed' || String(error?.message).includes('tool_use_failed'));
      if (!toolUseFailed || attempt >= MAX_RETRIES) throw error;
    }
  }
};

const systemPrompt = (userName) => `You are the PantryPal shopping assistant for ${userName || 'the user'}.
You help them shop groceries, manage their cart, their pantry and their recurring subscription.

How to work:
- Use the tools for anything about products, prices, stock, the cart, the pantry or the subscription. Never guess ids, prices or stock.
- To add something, first call search_products, pick the best match, then add it. If several products fit and the choice matters, ask.
- If a tool returns an error, relay its numbers exactly (e.g. how many more can be added) and only suggest things the tools can actually do.
- Only call open_checkout when the user wants to check out or place the order. You cannot place orders yourself; the user confirms in the checkout form.
- For recipe or "what should I cook" questions, check the pantry and prefer items that expire soonest.

${storePolicies}

Reply style: short, friendly plain text. Use "- " bullet lines for lists. No markdown headings, bold, tables or emojis. Prices in ৳.`;

// @desc    Chat with the shopping assistant (tool-calling agent)
// @route   POST /api/ai/chat
// @returns { reply, actions: { cartChanged, subscriptionChanged, openCheckout } }
const chatWithAI = async (req, res) => {
  const { message, history } = req.body;
  if (!message || typeof message !== 'string') {
    return res.status(400).json({ reply: 'Please type a message.' });
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return res.status(500).json({ reply: 'The assistant is not configured right now.' });
  const groq = new Groq({ apiKey });

  const effects = { cartChanged: false, subscriptionChanged: false, openCheckout: false };
  const context = { userId: req.user._id, effects };

  const messages = [
    { role: 'system', content: systemPrompt(req.user.name) },
    ...(Array.isArray(history) ? history : [])
      .filter((m) => m && typeof m.text === 'string' && m.text.trim())
      .slice(-MAX_HISTORY)
      .map((m) => ({ role: m.sender === 'user' ? 'user' : 'assistant', content: m.text })),
    { role: 'user', content: message },
  ];

  try {
    for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
      const completion = await complete(groq, {
        model: MODEL,
        messages,
        tools: toolDefinitions,
        // On the last round, force a text answer instead of more tool calls
        tool_choice: round === MAX_TOOL_ROUNDS ? 'none' : 'auto',
        temperature: 1,
        top_p: 1,
        max_completion_tokens: 2048,
        reasoning_effort: 'medium',
      });

      const reply = completion.choices[0]?.message;
      const toolCalls = reply?.tool_calls || [];

      if (!toolCalls.length) {
        const text = toPlainText(reply?.content || '') || 'Done.';
        return res.json({ reply: text, actions: effects });
      }

      // Keep only the fields the API accepts back (drop the model's reasoning)
      messages.push({ role: 'assistant', content: reply.content || '', tool_calls: toolCalls });

      for (const call of toolCalls) {
        let args = {};
        try {
          args = JSON.parse(call.function.arguments || '{}');
        } catch {
          args = {};
        }
        const result = await runTool(call.function.name, args, context);
        messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) });
      }
    }

    // Unreachable in practice: the final round cannot call tools
    res.json({ reply: 'Done.', actions: effects });
  } catch (error) {
    console.error('AI Error:', error?.status, error?.message);
    const reply =
      error?.status === 429
        ? 'The assistant is busy right now. Please try again in a moment.'
        : 'Sorry, I could not reach the assistant. Please try again.';
    // Tools may have already run before the failure; report their effects so the UI stays in sync
    res.status(502).json({ reply, actions: effects });
  }
};

module.exports = { chatWithAI };
