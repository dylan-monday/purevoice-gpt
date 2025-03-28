const { App, ExpressReceiver } = require('@slack/bolt');
const { OpenAI } = require('openai');
require('dotenv').config();

// Initialize ExpressReceiver to access Express app for custom routes
const receiver = new ExpressReceiver({
  signingSecret: process.env.SLACK_SIGNING_SECRET,
});

// Access the Express app to define custom routes
receiver.app.get('/', (req, res) => {
  res.send('Slack PureVoice Bot is running!');
});

// Initialize the Bolt App with the receiver
const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  receiver,
});

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Define the brand voice prompt
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

// Function to extract image URLs from text
function extractImageUrlFromText(text) {
  const urlRegex = /(https?:\/\/.+\.(?:png|jpg|jpeg|gif))/i;
  const match = text.match(urlRegex);
  return match ? match[1] : null;
}

// Event listener for app mentions
app.event('app_mention', async ({ event, client }) => {
  console.log('🔔 Incoming @mention event from Slack:', event.text);

  // Post a "thinking" message in the thread
  const thinkingMessage = await client.chat.postMessage({
    channel: event.channel,
    thread_ts: event.thread_ts || event.ts,
    text: "✏️ PureVoice is thinking...",
  });

  try {
    const threadTs = event.thread_ts || event.ts;

    // Retrieve the thread history
    const threadHistory = await client.conversations.replies({
      channel: event.channel,
      ts: threadTs,
    });

    // Construct messages for OpenAI
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

    let response;
    if (pastedImageUrl) {
      // Vision Mode with image analysis
      const completion = await openai.chat.completions.create({
        model: "gpt-4-turbo",
        messages: [
          { role: "system", content: brandVoicePrompt },
          {
            role: "user",
            content: [
              { type: "text", text: event.text },
              { type: "image_url", image_url: { url: pastedImageUrl } },
            ],
          },
        ],
      });
      response = completion.choices[0].message.content;
    } else {
      // Text-only mode
      const completion = await openai.chat.completions.create({
        model: "gpt-4-turbo",
        messages: messages,
      });
      response = completion.choices[0].message.content;
    }

    // Update the "thinking" message with the response
    await client.chat.update({
      channel: event.channel,
      ts: thinkingMessage.ts,
      text: response || "Here's your PureVoice insight!",
      thread_ts: threadTs,
    });
  } catch (error) {
    console.error('❌ API error:', error);
    await client.chat.update({
      channel: event.channel,
      ts: thinkingMessage.ts,
      text: "Oops! Something went wrong.",
    });
  }
});

// Start the app
(async () => {
  await app.start(process.env.PORT || 3000);
  console.log('⚡️ Slack PureVoice Bot is running!');
})();
