// index.js (CommonJS - minimal)
const { Client, GatewayIntentBits } = require("discord.js");
const axios = require("axios");
const express = require("express");

// simple HTTP server (health / keepalive)
const app = express();
app.get("/", (req, res) => res.send("ok"));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`HTTP server listening on ${PORT}`));

// Discord client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// env vars (set these in Koyeb secrets)
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const HF_TOKEN = process.env.HF_TOKEN;           // Hugging Face API token
const HF_MODEL = process.env.HF_MODEL || "google/flan-t5-large";
const NEWS_API = process.env.NEWS_API;          // NewsAPI.org key

if (!DISCORD_TOKEN) {
  console.error("ERROR: DISCORD_TOKEN not set.");
  process.exit(1);
}

client.once("ready", () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

// AI reply via Hugging Face Inference API
async function aiReply(prompt) {
  try {
    const url = `https://api-inference.huggingface.co/models/${HF_MODEL}`;
    const res = await axios.post(
      url,
      { inputs: prompt },
      { headers: { Authorization: `Bearer ${HF_TOKEN}` }, timeout: 60000 }
    );
    const d = res.data;
    // HF may return array [{generated_text: "..."}] or object {generated_text: "..."}
    if (Array.isArray(d) && d[0]?.generated_text) return d[0].generated_text;
    if (d.generated_text) return d.generated_text;
    // Some models return completions in different shapes
    if (typeof d === "string") return d;
    return JSON.stringify(d).slice(0, 2000);
  } catch (err) {
    console.error("aiReply error:", err?.response?.data || err.message || err);
    return "⚠️ Error getting AI reply.";
  }
}

// News fetch (NewsAPI.org)
async function getNews(topic) {
  try {
    if (!NEWS_API) return "⚠️ NEWS_API not configured.";
    const q = topic && topic.trim() ? encodeURIComponent(topic) : "latest";
    const url = `https://newsapi.org/v2/everything?q=${q}&pageSize=5&sortBy=publishedAt&apiKey=${NEWS_API}`;
    const res = await axios.get(url, { timeout: 20000 });
    const articles = res.data?.articles;
    if (!articles || articles.length === 0) return "No news found for that topic.";
    // Build short list of top 3
    const top = articles.slice(0, 3).map((a, i) => `${i + 1}. ${a.title}\n${a.url}`).join("\n\n");
    return `📰 Top results for "${topic || "latest"}":\n\n${top}`;
  } catch (err) {
    console.error("getNews error:", err?.response?.data || err.message || err);
    return "⚠️ Error fetching news.";
  }
}

client.on("messageCreate", async (msg) => {
  if (msg.author.bot) return;

  const content = msg.content.trim();

  if (content.startsWith("!ai")) {
    const prompt = content.replace(/^!ai\s*/i, "").trim();
    if (!prompt) return msg.reply("Usage: `!ai your question here`");
    await msg.channel.sendTyping();
    const reply = await aiReply(prompt);
    return msg.reply(reply.length > 2000 ? reply.slice(0, 1990) + "…" : reply);
  }

  if (content.startsWith("!news")) {
    const topic = content.replace(/^!news\s*/i, "").trim();
    await msg.channel.sendTyping();
    const reply = await getNews(topic);
    return msg.reply(reply);
  }

  if (content === "!help") {
    return msg.reply("Commands:\n• `!ai <text>` — AI reply (Hugging Face)\n• `!news <topic>` — Latest news");
  }
});

client.login(DISCORD_TOKEN).catch((e) => {
  console.error("Discord login failed:", e);
  process.exit(1);
});
