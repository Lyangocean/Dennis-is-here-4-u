import 'dotenv/config';
import express from 'express';
import { Telegraf } from 'telegraf';
import { GoogleGenerativeAI } from '@google/generative-ai';

// 1. Validation of configuration
if (!process.env.TELEGRAM_BOT_TOKEN) {
  console.error('CRITICAL ERROR: TELEGRAM_BOT_TOKEN is not set in environment variables!');
  process.exit(1);
}

if (!process.env.GEMINI_API_KEY) {
  console.error('CRITICAL ERROR: GEMINI_API_KEY is not set in environment variables!');
  process.exit(1);
}

// 2. Initialize Express Server (For Render deployment health checks)
const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.status(200).json({
    status: 'online',
    message: 'Dennis AI Telegram Bot is running perfectly!',
    timestamp: new Date().toISOString()
  });
});

app.listen(port, () => {
  console.log(`[Express] Health check server listening on port ${port}`);
});

// 3. Initialize Gemini Generative AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Models ordered by preference. We try them in order until one works.
const MODELS = ['gemini-2.5-flash-lite', 'gemini-2.5-flash'];

// System instruction generator
function getSystemInstruction(userName) {
  return `You are Dennis, a wise, super friendly, and supportive personal AI assistant. You act and talk exactly like Dennis.
Your areas of expertise are:
1. Creativity (brainstorming, writing content, office tasks)
2. Life advice (practical wisdom, growth, mindset)
3. Money management and investment (saving, smart investing, wealth building)

All of these are inspired by the greatest minds. You speak primarily in English and Burmese, adapting and mixing them naturally to match the user's preferences.
You must act super friendly and supportive, but also be wise enough to point out what the user is missing and what needs to be fixed. Don't be afraid to give them a gentle, constructive reality check when needed.
You have the ability to help with small office tasks like writing content, drafting/polishing emails, and organizing ideas.

Your styling guidelines:
- You must always address the user by their name, "${userName}", to keep the conversation highly personalized.
- You must naturally use phrases like "Here is what Dennis would do in your shoes" or "If I were in your shoes, here is what Dennis would do" when offering advice or ideas.
- Keep your tone warm, wise, encouraging, and structured.
- Do not use complex Markdown tables or heavy formatting that could break Telegram message formatting. Use simple bullets or bold text where appropriate.`;
}

// 4. Initialize Telegram Bot
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

// User sessions mapping (in-memory state)
const sessions = new Map();

// Helper: sleep for a given number of milliseconds
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Helper: Create a fresh Gemini chat session for a user
function createChatSession(userName, modelName) {
  const model = genAI.getGenerativeModel({
    model: modelName,
    systemInstruction: getSystemInstruction(userName),
  });
  return model.startChat({ history: [] });
}

// Helper: Send message with retry + model fallback
// - Retries up to 2 times on the current model (with 2s delay between retries)
// - If all retries fail, switches to the next model in the MODELS list
// - Repeats until all models are exhausted
async function sendMessageWithRetry(session, messageText) {
  const modelsToTry = [...MODELS];

  // Move the current model to the front of the list
  const currentIdx = modelsToTry.indexOf(session.modelName);
  if (currentIdx > 0) {
    modelsToTry.splice(currentIdx, 1);
    modelsToTry.unshift(session.modelName);
  }

  let lastError = null;

  for (const modelName of modelsToTry) {
    // If we're switching models, reinitialize the chat
    if (modelName !== session.modelName) {
      console.log(`[Fallback] Switching from ${session.modelName} to ${modelName}`);
      try {
        // Try to preserve history
        let history = [];
        try {
          history = await session.chat.getHistory();
        } catch (histErr) {
          console.log('[Fallback] Could not retrieve history, starting fresh chat.');
        }

        session.modelName = modelName;
        const newModel = genAI.getGenerativeModel({
          model: modelName,
          systemInstruction: getSystemInstruction(session.name),
        });
        session.chat = newModel.startChat({ history });
      } catch (switchErr) {
        console.error(`[Fallback] Failed to initialize ${modelName}:`, switchErr.message);
        continue; // Skip to next model
      }
    }

    // Try sending the message up to 3 times on this model
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        console.log(`[Gemini] Sending message with ${modelName} (attempt ${attempt}/3)`);
        const result = await session.chat.sendMessage(messageText);
        const text = result.response.text();
        console.log(`[Gemini] Success with ${modelName} on attempt ${attempt}`);
        return text;
      } catch (error) {
        lastError = error;
        const errMsg = error.message || String(error);
        console.error(`[Gemini] ${modelName} attempt ${attempt}/3 failed: ${errMsg}`);

        // If it's a rate limit (429) or server error (503), wait and retry
        if (errMsg.includes('429') || errMsg.includes('503') || errMsg.includes('overloaded') || errMsg.includes('unavailable') || errMsg.includes('quota')) {
          if (attempt < 3) {
            const delayMs = attempt * 3000; // 3s, 6s
            console.log(`[Gemini] Waiting ${delayMs}ms before retry...`);
            await sleep(delayMs);
          }
        } else {
          // For non-transient errors (e.g. bad request), don't retry on same model
          console.error(`[Gemini] Non-transient error, skipping remaining retries for ${modelName}`);
          break;
        }
      }
    }
  }

  // All models and retries exhausted
  console.error('[Gemini] All models and retries exhausted. Last error:', lastError?.message);
  throw lastError;
}

// Command: /start
bot.command('start', (ctx) => {
  const chatId = ctx.chat.id;
  const defaultModel = MODELS[0];

  sessions.set(chatId, {
    name: null,
    awaitingName: true,
    chat: null,
    modelName: defaultModel
  });

  ctx.reply(
    "Mingalaba! I'm Dennis. 🌟\n\n" +
    "I'm here to support you with creativity, life advice, and money management.\n\n" +
    "Before we get started, what's your name?"
  );
});

// Command: /name (Change user name)
bot.command('name', (ctx) => {
  const chatId = ctx.chat.id;
  const currentSession = sessions.get(chatId) || { name: null };
  
  sessions.set(chatId, {
    ...currentSession,
    awaitingName: true
  });
  
  ctx.reply("Sure! What should I call you from now on?");
});

// Command: /reset (Reset chat history)
bot.command('reset', (ctx) => {
  const chatId = ctx.chat.id;
  const session = sessions.get(chatId);

  if (!session || !session.name) {
    return ctx.reply("We haven't started yet! Use /start to begin.");
  }

  try {
    session.modelName = MODELS[0];
    session.chat = createChatSession(session.name, session.modelName);
    sessions.set(chatId, session);
    ctx.reply(`No problem, ${session.name}! I've cleared our previous chat history. What's on your mind now?`);
  } catch (error) {
    console.error('Error resetting chat:', error);
    ctx.reply("Sorry, I had trouble resetting the conversation. Try running /start.");
  }
});

// Command: /help
bot.command('help', (ctx) => {
  ctx.reply(
    "Here is how you can interact with me:\n\n" +
    "• /start - Start the conversation and set your name.\n" +
    "• /name - Change the name I call you.\n" +
    "• /reset - Clear our conversation history to start fresh.\n" +
    "• Send any message, question, email to review, or topic to discuss, and we'll chat!"
  );
});

// Message Handler
bot.on('text', async (ctx) => {
  const chatId = ctx.chat.id;
  const messageText = ctx.message.text.trim();
  let session = sessions.get(chatId);

  // Fallback: If session doesn't exist, ask for name first
  if (!session) {
    sessions.set(chatId, {
      name: null,
      awaitingName: true,
      chat: null,
      modelName: MODELS[0]
    });
    return ctx.reply("Hey there! Dennis here. I think my memory got refreshed. What was your name again?");
  }

  // Handle name input phase
  if (session.awaitingName) {
    if (!messageText) {
      return ctx.reply("Please let me know your name so we can make this personal!");
    }
    
    session.name = messageText;
    session.awaitingName = false;

    try {
      session.modelName = MODELS[0];
      session.chat = createChatSession(session.name, session.modelName);
      sessions.set(chatId, session);

      return ctx.reply(
        `Great to meet you, ${session.name}! 😄\n\n` +
        `How can I help you today? Whether you need some life advice, investment tips, creativity brainstorming, or help writing an email, Dennis has got your back. Let's do this!`
      );
    } catch (error) {
      console.error('Error initializing Gemini model:', error);
      session.awaitingName = true;
      return ctx.reply("Oops, I had trouble setting up our session. Could you try typing your name again?");
    }
  }

  // Regular chat session with Gemini
  try {
    await ctx.sendChatAction('typing');

    const responseText = await sendMessageWithRetry(session, messageText);

    // Telegram has a 4096 character limit per message. Split if needed.
    if (responseText.length > 4000) {
      const chunks = responseText.match(/[\s\S]{1,4000}/g) || [responseText];
      for (const chunk of chunks) {
        await ctx.reply(chunk);
      }
    } else {
      await ctx.reply(responseText);
    }
  } catch (error) {
    console.error('[Bot] Final error after all retries:', error.message);
    await ctx.reply(
      "I'm really sorry, but Google's AI servers are experiencing issues right now. " +
      "Please try again in a minute or two! Dennis will be right here waiting for you. 🙏"
    );
  }
});

// Start the bot using Long Polling
bot.launch()
  .then(() => {
    console.log(`[Telegram] Dennis AI Bot started. Primary model: ${MODELS[0]}, Fallback: ${MODELS[1]}`);
  })
  .catch((err) => {
    console.error('[Telegram] Failed to start bot:', err);
    process.exit(1);
  });

// Handle graceful stops
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
