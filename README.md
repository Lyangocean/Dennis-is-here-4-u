# Dennis AI Telegram Bot 🌟

Dennis AI is a personal Telegram bot assistant that acts like Dennis—friendly, supportive, yet wise and direct. It specializes in **creativity, life advice, and money management/investments**, offering guidance in both **English and Burmese**.

The bot leverages:
- **Telegraf** for interacting with the Telegram Bot API.
- **Google Gemini API** (`gemini-1.5-flash`) for natural, personalized conversations.
- **Express** for a lightweight server to respond to Render's health checks.

---

## Features

- **Personalized Conversations**: Dennis asks for your name first and addresses you by it.
- **Catchphrase Integration**: Infuses advice with *"Here is what Dennis would do in your shoes"*.
- **Task Assistance**: Helps write content, drafts emails, and brainstorming office tasks.
- **Session Control**:
  - `/start` to start/restart.
  - `/name` to update the name Dennis calls you.
  - `/reset` to clear chat history.
  - `/help` to view commands.

---

## Local Setup

### 1. Prerequisites
Ensure you have [Node.js](https://nodejs.org/) (v18+ recommended) installed.

### 2. Install Dependencies
Navigate to the project directory and run:
```bash
npm install
```

### 3. Setup Environment Variables
Create a file named `.env` in the root of the project (this is already ignored in `.gitignore`) and add your credentials:
```env
TELEGRAM_BOT_TOKEN=your_telegram_bot_token
GEMINI_API_KEY=your_gemini_api_key
PORT=3000
```

### 4. Run Locally
To start the bot in development/long-polling mode:
```bash
npm start
```
You should see:
```text
[Express] Health check server listening on port 3000
[Telegram] Dennis AI Bot successfully started and polling messages...
```

---

## Upload to GitHub

To deploy to Render, your codebase must be hosted on a GitHub repository. Follow these steps:

1. **Initialize Git**:
   ```bash
   git init
   ```
2. **Add Files**:
   ```bash
   git add .
   ```
3. **Commit**:
   ```bash
   git commit -m "Initial commit: Dennis AI Telegram Bot"
   ```
4. **Create a GitHub Repository**:
   - Go to [GitHub](https://github.com/) and create a new repository (e.g., `dennis-ai-bot`).
   - Leave it public or private (private is recommended for personal bots).
5. **Link and Push**:
   Replace `yourusername` with your actual GitHub username:
   ```bash
   git branch -M main
   git remote add origin https://github.com/yourusername/dennis-ai-bot.git
   git push -u origin main
   ```

---

## Deploy to Render

Render is an excellent platform for deploying Node.js applications. Follow these steps to host your bot for free:

### 1. Create a Web Service on Render
1. Sign in to [Render](https://render.com/).
2. Click **New +** and select **Web Service**.
3. Connect your GitHub account and select your `dennis-ai-bot` repository.

### 2. Configure Settings
- **Name**: `dennis-ai-bot` (or your preferred name)
- **Environment**: `Node`
- **Region**: Select the region closest to you.
- **Branch**: `main`
- **Root Directory**: Leave blank (unless you placed it in a subfolder on Git).
- **Runtime**: `Node`
- **Build Command**: `npm install`
- **Start Command**: `npm start`
- **Instance Type**: Select the **Free** tier.

### 3. Add Environment Variables
1. Scroll down to **Advanced** or click the **Environment** tab on Render.
2. Add the following environment variables:
   - `TELEGRAM_BOT_TOKEN`: Your secret bot token.
   - `GEMINI_API_KEY`: Your secret Gemini API key.
   - `PORT`: (Render sets this automatically, but you can explicitly add `3000` or leave it blank to let Render assign it).
3. Click **Create Web Service**.

Render will now build and deploy your application. The Express server binds to the allocated port, ensuring Render's health checks pass. The bot will automatically start polling for Telegram messages.
