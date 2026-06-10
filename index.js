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

const ADMIN_ID = 5487015519;
const users = new Set();

const SNK_TEXT = `📜 Syarat & Ketentuan

1. Produk digital tidak bisa refund setelah dikirim.
2. Garansi sesuai deskripsi produk.
3. Pastikan membaca deskripsi sebelum membeli.
★ 𝐖𝐀𝐑𝐀𝐍𝐓𝐘 𝐓𝐎 𝐀𝐂𝐓𝐈𝐕𝐄 ★

ㅤ— wajib send screenshot login max 1x24jam ke [ https://t.me/twestip/134 ]
ㅤ— apabila ada problem dengan akun nya mohon untuk mengisi format garansi di @warantyj
ㅤ— tidak ss login lebih dari 24jam dianggap tidak ada garansi
ㅤㅤㅤㅤㅤㅤㅤㅤㅤ`;

const product = {
  name: "netflix",
  price: 100,
  stock: 5,
  desc: "nogar"
};

const userOrders = {};

function formatRupiah(number) {
  return "Rp " + number.toLocaleString("id-ID");
}

function orderText(userId) {
  const qty = userOrders[userId]?.qty || 1;
  const total = product.price * qty;

  return `KONFIRMASI PESANAN

Produk: ${product.name}
Stok Tersedia: ${product.stock} pcs
Harga Satuan: ${formatRupiah(product.price)}
----------------
Jumlah Pesanan: ${qty} pcs
Total Harga: ${formatRupiah(total)}
----------------
Deskripsi Produk:
• ${product.desc}`;
}

function orderKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback("- Semua", "MIN_ALL"),
      Markup.button.callback("+ Semua", "PLUS_ALL")
    ],
    [
      Markup.button.callback("-5", "MIN_5"),
      Markup.button.callback("-1", "MIN_1"),
      Markup.button.callback("+1", "PLUS_1"),
      Markup.button.callback("+5", "PLUS_5")
    ],
    [Markup.button.callback("Pilih metode pembayaran", "PAY")],
    [Markup.button.callback("Batalkan", "CANCEL")]
  ]);
}

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

async function createPayment(ctx, amount, qty) {
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

Produk: ${product.name}
Jumlah: ${qty} pcs
Total Bayar: ${formatRupiah(data.totalAmount)}

Deposit ID:
${depositId}

Silakan bayar QRIS:
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

        product.stock -= qty;

await ctx.reply(`
✅ PEMBAYARAN BERHASIL

Produk: ${productName}

Email: netflix@gmail.com
Password: password123

━━━━━━━━━━━━━━

📜 Syarat & Ketentuan

• No refund
• Garansi 1x24 jam
• Login maksimal 1 device
• Jangan mengganti email akun

★ 𝐖𝐀𝐑𝐀𝐍𝐓𝐘 𝐓𝐎 𝐀𝐂𝐓𝐈𝐕𝐄 ★

ㅤ— wajib send screenshot login max 1x24jam ke [ https://t.me/twestip/134 ]
ㅤ— apabila ada problem dengan akun nya mohon untuk mengisi format garansi di @warantyj
ㅤ— tidak ss login lebih dari 24jam dianggap tidak ada garansi
ㅤㅤㅤㅤㅤㅤㅤㅤㅤ

━━━━━━━━━━━━━━

Terima kasih telah berbelanja 🙏
`);

      if (status.data && status.data.status === "already") {
        clearInterval(interval);
      }

      if (attempts >= 60) {
        clearInterval(interval);
        console.log("Cek pembayaran timeout.");
      }
    } catch (err) {
      console.log("CHECK STATUS ERROR:", err.response?.data || err.message);
    }
  }, 10000);
}

bot.start((ctx) => {
  users.add(ctx.from.id);

  ctx.reply(
    "Selamat datang di Bot Auto Order!",
    Markup.inlineKeyboard([
      [Markup.button.callback("📦 Order Produk", "ORDER")],
      [Markup.button.callback("📜 SNK", "SNK")]
    ])
  );
});

bot.action("ORDER", async (ctx) => {
  const userId = ctx.from.id;

  userOrders[userId] = {
    qty: 1
  };

  await ctx.reply(orderText(userId), orderKeyboard());
});

bot.action(["PLUS_1", "PLUS_5", "PLUS_ALL", "MIN_1", "MIN_5", "MIN_ALL"], async (ctx) => {
  const userId = ctx.from.id;

  if (!userOrders[userId]) {
    userOrders[userId] = { qty: 1 };
  }

  let qty = userOrders[userId].qty;

  if (ctx.match[0] === "PLUS_1") qty += 1;
  if (ctx.match[0] === "PLUS_5") qty += 5;
  if (ctx.match[0] === "PLUS_ALL") qty = product.stock;

  if (ctx.match[0] === "MIN_1") qty -= 1;
  if (ctx.match[0] === "MIN_5") qty -= 5;
  if (ctx.match[0] === "MIN_ALL") qty = 1;

  if (qty < 1) qty = 1;
  if (qty > product.stock) qty = product.stock;

  userOrders[userId].qty = qty;

  await ctx.editMessageText(orderText(userId), orderKeyboard());
});

bot.action("PAY", async (ctx) => {
  try {
    const userId = ctx.from.id;
    const qty = userOrders[userId]?.qty || 1;

    if (qty > product.stock) {
      return ctx.reply("Stok tidak cukup.");
    }

    const total = product.price * qty;

    await createPayment(ctx, total, qty);
  } catch (err) {
    console.error("PAYMENT ERROR:", err.response?.data || err.message);
    ctx.reply("Gagal membuat pembayaran. Cek Railway Logs.");
  }
});

bot.action("CANCEL", async (ctx) => {
  const userId = ctx.from.id;
  delete userOrders[userId];

  await ctx.editMessageText("Pesanan dibatalkan.");
});

bot.action("SNK", async (ctx) => {
  await ctx.reply(SNK_TEXT);
});

bot.command("broadcast", async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) {
    return ctx.reply("Anda bukan admin.");
  }

  const text = ctx.message.text.replace("/broadcast", "").trim();

  if (!text) {
    return ctx.reply("Format: /broadcast isi pesan");
  }

  let success = 0;

  for (const userId of users) {
    try {
      await bot.telegram.sendMessage(userId, text);
      success++;
    } catch (err) {
      console.log("Gagal kirim ke", userId);
    }
  }

  ctx.reply(`Broadcast terkirim ke ${success} user.`);
});

bot.on("photo", async (ctx) => {
  if (ctx.from.id !== ADMIN_ID) return;

  const caption = ctx.message.caption || "";

  if (!caption.startsWith("/broadcastfoto")) return;

  const text = caption.replace("/broadcastfoto", "").trim();
  const photo = ctx.message.photo[ctx.message.photo.length - 1].file_id;

  let success = 0;

  for (const userId of users) {
    try {
      await bot.telegram.sendPhoto(userId, photo, {
        caption: text || undefined
      });
      success++;
    } catch (err) {
      console.log("Gagal kirim foto ke", userId);
    }
  }

  ctx.reply(`Broadcast foto terkirim ke ${success} user.`);
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