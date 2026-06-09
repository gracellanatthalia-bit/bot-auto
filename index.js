require("dotenv").config();

const express = require("express");
const { Telegraf, Markup } = require("telegraf");

if (!process.env.BOT_TOKEN) {
  throw new Error("BOT_TOKEN belum terbaca di Railway");
}

const app = express();
const bot = new Telegraf(process.env.BOT_TOKEN.trim());

app.use(express.json());

bot.start((ctx) => {
  ctx.reply(
    "Selamat datang di Bot Auto Order!",
    Markup.inlineKeyboard([
      [Markup.button.callback("📦 Order Produk", "ORDER")]
    ])
  );
});

bot.action("ORDER", (ctx) => {
  ctx.reply(
    "Pilih Produk:",
    Markup.inlineKeyboard([
      [Markup.button.callback("Produk A - Rp10.000", "PRODUK_A")],
      [Markup.button.callback("Produk B - Rp20.000", "PRODUK_B")]
    ])
  );
});

app.get("/", (req, res) => {
  res.send("Bot berjalan dengan baik");
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});

bot.telegram.getMe()
  .then((botInfo) => {
    console.log("Bot connected:", botInfo.username);
    bot.launch();
  })
  .catch((err) => {
    console.error("BOT_TOKEN ERROR:", err.message);
  });