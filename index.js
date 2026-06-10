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

  const interval = setInterval(async () => {
    try {
      const status = await checkDepositStatus(depositId);

      console.log("STATUS:", status);

      if (
        status.data &&
        status.data.status === "success"
      ) {
        clearInterval(interval);

        await ctx.reply(
          `✅ Pembayaran berhasil!

Produk ${productName} sudah dibayar.`
        );
      }

      if (
        status.data &&
        status.data.status === "already"
      ) {
        clearInterval(interval);
      }

    } catch (err) {
      console.log("CHECK STATUS ERROR:", err.message);
    }
  }, 10000);
}
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

  await ctx.reply(
    `✅ Invoice berhasil dibuat

Produk: ${productName}
Nominal: Rp${amount}
Total Bayar: Rp${data.totalAmount}

Deposit ID:
${data.depositId}

Silakan bayar menggunakan QRIS di link berikut:
${data.qrImage}`
  );
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
      [Markup.button.callback("Produk A - Rp10.000", "PRODUK_A")],
      [Markup.button.callback("Produk B - Rp20.000", "PRODUK_B")]
    ])
  );
});

bot.action("PRODUK_A", async (ctx) => {
  try {
    await createPayment(ctx, "Produk A", 10000);
  } catch (err) {
    console.error("ERROR PRODUK_A:", err.response?.data || err.message);
    ctx.reply("Gagal membuat pembayaran. Cek API Ramashop atau Railway Logs.");
  }
});

bot.action("PRODUK_B", async (ctx) => {
  try {
    await createPayment(ctx, "Produk B", 20000);
  } catch (err) {
    console.error("ERROR PRODUK_B:", err.response?.data || err.message);
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