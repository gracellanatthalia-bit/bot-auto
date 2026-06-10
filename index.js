require("dotenv").config();

const express = require("express");
const axios = require("axios");
const crypto = require("crypto");
const { Telegraf, Markup } = require("telegraf");

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const BOT_TOKEN = process.env.BOT_TOKEN;

if (!BOT_TOKEN) {
  console.error("BOT_TOKEN belum terbaca dari Railway Variables");
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN.trim());

const BASE_URL = "https://google.com";
const IPAYMU_URL = "https://my.ipaymu.com/api/v2/payment";
const IPAYMU_VA = process.env.IPAYMU_VA;
const IPAYMU_API_KEY = process.env.IPAYMU_API_KEY;

function createSignature(body) {
  const jsonBody = JSON.stringify(body);
  const bodyHash = crypto
    .createHash("sha256")
    .update(jsonBody)
    .digest("hex")
    .toLowerCase();

  const stringToSign = "POST:" + IPAYMU_VA + ":" + bodyHash + ":" + IPAYMU_API_KEY;

  return crypto
    .createHmac("sha256", IPAYMU_API_KEY)
    .update(stringToSign)
    .digest("hex");
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
        "X-API-Key": process.env.RAMASHOP_API_KEY,
        "Content-Type": "application/json"
      }
    }
  );

  console.log(response.data);

  if (!response.data.success) {
    throw new Error("Gagal membuat QRIS");
  }

  const data = response.data.data;

  await ctx.reply(
    `✅ Invoice dibuat

Produk: ${productName}
Nominal: Rp${amount}
Total Bayar: Rp${data.totalAmount}

Deposit ID:
${data.depositId}

QRIS:
${data.qrImage}`
  );
}
  const signature = createSignature(body);

  const response = await axios.post(IPAYMU_URL, body, {
    headers: {
      "Content-Type": "application/json",
      va: IPAYMU_VA,
      signature: signature,
      timestamp: new Date().toISOString()
    }
  });

  console.log("IPAYMU RESPONSE:", response.data);

  const paymentUrl =
    response.data?.Data?.Url ||
    response.data?.Data?.url ||
    response.data?.url;

  if (!paymentUrl) {
    throw new Error("Link pembayaran tidak ditemukan dari response iPaymu");
  }

  await ctx.reply(
    `✅ Invoice berhasil dibuat\n\nProduk: ${productName}\nTotal: Rp${amount}\n\nKlik tombol di bawah untuk bayar:`,
    Markup.inlineKeyboard([
      [Markup.button.url("💳 Bayar Sekarang", paymentUrl)]
    ])
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
    console.error(err.response?.data || err.message);
    ctx.reply("Gagal membuat pembayaran. Cek API iPaymu atau Railway Logs.");
  }
});

bot.action("PRODUK_B", async (ctx) => {
  try {
    await createPayment(ctx, "Produk B", 20000);
  } catch (err) {
    console.error(err.response?.data || err.message);
    ctx.reply("Gagal membuat pembayaran. Cek API iPaymu atau Railway Logs.");
  }
});

app.post("/webhook/ipaymu", (req, res) => {
  console.log("CALLBACK IPAYMU:", req.body);

  res.status(200).send("OK");
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