require("dotenv").config();

const express = require("express");
const axios = require("axios");
const { Telegraf, Markup } = require("telegraf");

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const BOT_TOKEN = process.env.BOT_TOKEN;
const RAMASHOP_API_KEY = process.env.RAMASHOP_API_KEY;

if (!BOT_TOKEN) {
  console.error("BOT_TOKEN belum terbaca dari Railway Variables");
  process.exit(1);
}

if (!RAMASHOP_API_KEY) {
  console.error("RAMASHOP_API_KEY belum terbaca dari Railway Variables");
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN.trim());

async function checkDepositStatus(depositId) {
  const response = await axios.get(
    `https://ramashop.my.id/api/public/deposit/status/${depositId}`,
    {
      headers: {
        "X-API-Key": RAMASHOP_API_KEY,
        "Content-Type": "application/json"
      }
    }
  );

  return response.data;
}

async function createPayment(ctx, productName, amount) {
  const response = await axios.post(
    "https://ramashop.my.id/api/public/deposit/create",
    {
      amount: amount,
      method: "qris"
    },
    {
      headers: {
        "X-API-Key": RAMASHOP_API_KEY,
        "Content-Type": "application/json"
      }
    }
  );

  console.log("RAMASHOP RESPONSE:", response.data);

  if (!response.data.success) {
    throw new Error(response.data.message || "Gagal membuat QRIS Ramashop");
  }

  const data = response.data.data;
  const depositId = data.depositId;

  await ctx.reply(
    `✅ Invoice berhasil dibuat

Produk: ${productName}
Nominal: Rp${amount}
Total Bayar: Rp${data.totalAmount}

Deposit ID:
${depositId}

Silakan bayar menggunakan QRIS:
${data.qrImage}`
  );

  let attempts = 0;

  const interval = setInterval(async () => {
    try {
      attempts++;

      const status = await checkDepositStatus(depositId);
      console.log("STATUS:", status);

      if (status.data && status.data.status === "success") {
        clearInterval(interval);

await ctx.reply(
  `✅ Pembayaran berhasil!

Produk: ${productName}

📧 Email:
premium@gmail.com

🔑 Password:
masuk123
ㅤㅤㅤㅤㅤㅤㅤㅤㅤ

Terima kasih telah membeli.`
);
      }

      if (status.data && status.data.status === "already") {
        clearInterval(interval);
      }

      if (attempts >= 60) {
        clearInterval(interval);
        console.log("Cek pembayaran dihentikan karena timeout.");
      }
    } catch (err) {
      console.log("CHECK STATUS ERROR:", err.response?.data || err.message);
    }
  }, 10000);
}

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
      [Markup.button.callback("NETFLIX - Rp100", "NETFLIX")],
      [Markup.button.callback("VIU - Rp200", "VIU")]
    ])
  );
});

bot.action("PRODUK_A", async (ctx) => {
  try {
    await createPayment(ctx, "NETFLIX", 100);
  } catch (err) {
    console.error("ERROR NETFLIX:", err.response?.data || err.message);
    ctx.reply("Gagal membuat pembayaran. Cek API Ramashop atau Railway Logs.");
  }
});

bot.action("VIU", async (ctx) => {
  try {
    await createPayment(ctx, "VIU", 200);
  } catch (err) {
    console.error("ERROR VIU:", err.response?.data || err.message);
    ctx.reply("Gagal membuat pembayaran. Cek API Ramashop atau Railway Logs.");
  }
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