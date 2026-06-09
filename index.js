require("dotenv").config();

const express = require("express");
const { Telegraf } = require("telegraf");

if (!process.env.BOT_TOKEN) {
  throw new Error("BOT_TOKEN belum terbaca di Railway");
}

const app = express();
const bot = new Telegraf(process.env.BOT_TOKEN.trim());

app.use(express.json());

bot.start((ctx) => {
  ctx.reply("Selamat datang di Bot Auto Order!");
});

app.get("/", (req, res) => {
  res.send("Bot berjalan dengan baik");
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});

bot.launch();