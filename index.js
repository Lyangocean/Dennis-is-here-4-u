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
// Structure: { [chatId]: { name, awaitingName, chat } }
const sessions = new Map();

// Helper function to send message with fallback to gemini-2.5-flash-lite
async function sendMessageWithFallback(session, messageText) {
  try {
    const result = await session.chat.sendMessage(messageText);
    return result.response.text();
  } catch (error) {
    console.error(`Error with primary model ${session.modelName || 'gemini-2.5-flash'}:`, error);

    // If we've already fallen back, propagate error
    if (session.modelName === 'gemini-2.5-flash-lite') {
      throw error;
    }

    console.log('Attempting automatic fallback to gemini-2.5-flash-lite...');
    try {
      // Get chat history from current session
      const history = await session.chat.getHistory();

      // Initialize the fallback model
      session.modelName = 'gemini-2.5-flash-lite';
      const fallbackModel = genAI.getGenerativeModel({
        model: session.modelName,
        systemInstruction: getSystemInstruction(session.name),
      });

      // Start new chat with identical history
      session.chat = fallbackModel.startChat({ history });

      // Send the user message again
      const result = await session.chat.sendMessage(messageText);
      return result.response.text();
    } catch (fallbackError) {
      console.error('Fallback model gemini-2.5-flash-lite also failed:', fallbackError);
      throw error; // Throw original error so we report it
    }
  }
}

// Command: /start
bot.command('start', (ctx) => {
  const chatId = ctx.chat.id;
  
  // Reset session
  sessions.set(chatId, {
    name: null,
    awaitingName: true,
    chat: null,
    modelName: 'gemini-2.5-flash'
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
    session.modelName = 'gemini-2.5-flash';
    const userModel = genAI.getGenerativeModel({
      model: session.modelName,
      systemInstruction: getSystemInstruction(session.name),
    });
    session.chat = userModel.startChat({ history: [] });
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
      modelName: 'gemini-2.5-flash'
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
      session.modelName = 'gemini-2.5-flash';
      const userModel = genAI.getGenerativeModel({
        model: session.modelName,
        systemInstruction: getSystemInstruction(session.name),
      });
      session.chat = userModel.startChat({ history: [] });
      sessions.set(chatId, session);

      return ctx.reply(
        `Great to meet you, ${session.name}! 😄\n\n` +
        `How can I help you today? Whether you need some life advice, investment tips, creativity brainstorming, or help writing an email, Dennis has got your back. Let's do this!`
      );
    } catch (error) {
      console.error('Error initializing Gemini model:', error);
      session.awaitingName = true; // reset
      return ctx.reply("Oops, I had trouble setting up our session. Could you try typing your name again?");
    }
  }

  // Regular chat session with Gemini
  try {
    // Show typing status for premium feel
    await ctx.sendChatAction('typing');

    const responseText = await sendMessageWithFallback(session, messageText);
    await ctx.reply(responseText);
  } catch (error) {
    console.error('Error during Gemini API call:', error);
    await ctx.reply("Sorry, I hit a snag while thinking. Can you try sending that message again?");
  }
});

// Start the bot using Long Polling
bot.launch()
  .then(() => {
    console.log('[Telegram] Dennis AI Bot successfully started and polling messages...');
  })
  .catch((err) => {
    console.error('[Telegram] Failed to start bot:', err);
    process.exit(1);
  });

// Handle graceful stops
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
