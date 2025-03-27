const { App } = require('@slack/bolt');
const { OpenAI } = require('openai');
require('dotenv').config();

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const brandVoicePrompt = `
You are PureVoice, the AI-powered brand copy expert for Pure Agency. Your responses must always follow these guidelines:

- Pure Agency is confidently witty, clear, and jargon-free.
- Prioritize human connection over corporate jargon.
- Be clever but never sacrifice clarity.
- Be witty but always sophisticated and never frivolous.
- Use vernacular when it helps convey emotions.
- Tone is educated and informed, but not academic.
- Emphasize "Vigorously Uncomplicated" principles.
- Visual brand style is minimalist with bold, high-contrast layouts.
- Avoid buzzwords like "synergy," "game-changer," or "disruptive."
- Use punchy, bold, and simple language.
`;

function extractImageUrlFromText(text) {
  const urlRegex = /(https?:\/\/.+\.(?:png|jpg|jpeg|gif))/i;
  const match = text.match(urlRegex);
  return match ? match[1] : null;
}

app.event('app_mention', async ({ event, client }) => {
  console.log('🔔 Incoming @mention event from Slack:', event.text);

  const thinkingMessage = await client.chat.postMessage({
    channel: event.channel,
    thread_ts: event.thread_ts || event.ts,
    text: "✏️ PureVoice is thinking...",
  });

  try {
    const threadTs = event.thread_ts || event.ts;
    const threadHistory = await client.conversations.replies({
      channel: event.channel,
      ts: threadTs,
    });

    const messages = [{ role: "system", content: brandVoicePrompt }];

    threadHistory.messages.forEach((msg) => {
      if (msg.bot_id) {
        messages.push({ role: "assistant", content: msg.text });
      } else {
        messages.push({ role: "user", content: msg.text });
      }
    });

    // Check for pasted image URL in the latest message
    const pastedImageUrl = extractImageUrlFromText(event.text);

    if (pastedImageUrl) {
      // Vision Mode
      const completion = await openai.chat.completions.create({
        model: "gpt-4-turbo",
        messages: [
          { role: "system", content: brandVoicePrompt },
          { role: "user", content: [
            { type: "text", text: `${event.text}` },
            { type: "image_url", image_url: { url: pastedImageUrl } }
          ] }
        ]
      });

      const response = completion.choices[0].message.content;
      await client.chat.update({
        channel: event.channel,
        ts: thinkingMessage.ts,
        text: response || "Here's your PureVoice insight!",
        thread_ts: threadTs,
      });
    } else {
      // Text-only fallback
      const completion = await openai.chat.completions.create({
        model: "gpt-4-turbo",
        messages: messages,
      });

      const response = completion.choices[0].message.content;
      await client.chat.update({
        channel: event.channel,
        ts: thinkingMessage.ts,
        text: response || "Here's your PureVoice response!",
        thread_ts: threadTs,
      });
    }
  } catch (error) {
    console.error('❌ API error:', error);
    await client.chat.update({
      channel: event.channel,
      ts: thinkingMessage.ts,
      text: "Oops! Something went wrong.",
    });
  }
});

(async () => {
  await app.start(process.env.PORT || 3000);
  console.log('⚡️ Slack PureVoice Bot is running');
})();
