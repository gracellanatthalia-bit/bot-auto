require("dotenv").config();

const express = require("express");
const axios = require("axios");
const fs = require("fs");
const { Telegraf, Markup } = require("telegraf");

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const BOT_TOKEN = process.env.BOT_TOKEN;
const RAMASHOP_API_KEY = process.env.RAMASHOP_API_KEY;
const ADMIN_ID = 5487015519;

if (!BOT_TOKEN) {
  console.error("BOT_TOKEN belum terbaca dari Railway Variables");
  process.exit(1);
}

if (!RAMASHOP_API_KEY) {
  console.error("RAMASHOP_API_KEY belum terbaca dari Railway Variables");
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN.trim());

const USERS_FILE = "users.json";
const PRODUCTS_FILE = "products.json";
const STOCKS_FILE = "stocks.json";
const SNK_FILE = "snk.txt";

const BALANCES_FILE = "balances.json";
const TRANSACTIONS_FILE = "transactions.json";

const adminState = {};
const userOrders = {};

function ensureFile(file, defaultValue) {
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, defaultValue);
  }
}

ensureFile(USERS_FILE, "[]");
ensureFile(PRODUCTS_FILE, "{}");
ensureFile(STOCKS_FILE, "{}");

ensureFile(BALANCES_FILE, "{}");
ensureFile(TRANSACTIONS_FILE, "[]");

function readJSON(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (err) {
    return file === USERS_FILE ? [] : {};
  }
}

function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function getBalance(userId) {
  const balances = readJSON(BALANCES_FILE);
  return balances[userId] || 0;
}

function addBalance(userId, amount) {
  const balances = readJSON(BALANCES_FILE);

  balances[userId] = (balances[userId] || 0) + amount;

  writeJSON(BALANCES_FILE, balances);
}

function reduceBalance(userId, amount) {
  const balances = readJSON(BALANCES_FILE);

  balances[userId] = (balances[userId] || 0) - amount;

  writeJSON(BALANCES_FILE, balances);
}

function readText(file) {
  return fs.readFileSync(file, "utf8");
}

function writeText(file, text) {
  fs.writeFileSync(file, text);
}

function isAdmin(ctx) {
  return ctx.from && ctx.from.id === ADMIN_ID;
}

function addUser(userId) {
  const users = readJSON(USERS_FILE);
  if (!users.includes(userId)) {
    users.push(userId);
    writeJSON(USERS_FILE, users);
  }
}

function formatRupiah(num) {
  return "Rp " + Number(num).toLocaleString("id-ID");
}

function getProducts() {
  return readJSON(PRODUCTS_FILE);
}

function getStocks() {
  return readJSON(STOCKS_FILE);
}

function stockText() {
  const products = getProducts();
  const stocks = getStocks();

  const ids = Object.keys(products);

  if (ids.length === 0) {
    return "Belum ada produk. Admin bisa tambah produk dengan /addproduk";
  }

  let text = "📦 STOK TERSEDIA\n\n";

  ids.forEach((id, index) => {
    const p = products[id];
    const stockCount = stocks[id] ? stocks[id].length : 0;
    text += `[${index + 1}] ${p.name.toUpperCase()} → ${formatRupiah(p.price)} (x${stockCount})\n`;
  });

  text += "\nKetik angka produk yang ingin dibeli.\nContoh: 1";
  return text;
}

function getProductByNumber(number) {
  const products = getProducts();
  const ids = Object.keys(products);
  const id = ids[number - 1];

  if (!id) return null;

  return {
    id,
    ...products[id]
  };
}

function paymentKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback(`💰 Saldo: ${formatRupiah(getBalance(ctx.from.id))}`, "PAY_SALDO"),
      Markup.button.callback("QRIS", "PAY_QRIS")
    ],
    [Markup.button.callback("Kembali", "BACK_STOCK")],
    [Markup.button.callback("Batalkan", "CANCEL")]
  ]);
}

function deliveryText(product, account) {
  const snk = readText(SNK_FILE);
  const [email, password] = account.split("|");

  return `${product.name.toUpperCase()}

Email: ${email}
Password: ${password}

${snk}`;
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

async function createPayment(ctx, productId) {
  const products = getProducts();
  const stocks = getStocks();
  const product = products[productId];

  if (!product) {
    return ctx.reply("Produk tidak ditemukan.");
  }

  if (!stocks[productId] || stocks[productId].length < 1) {
    return ctx.reply("Stok produk habis.");
  }

  const response = await axios.post(
    "https://ramashop.my.id/api/public/deposit/create",
    {
      amount: Number(product.price),
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
Harga: ${formatRupiah(product.price)}
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

        const latestStocks = getStocks();
        const account = latestStocks[productId].shift();
        writeJSON(STOCKS_FILE, latestStocks);

        await ctx.reply("✅ Pembayaran berhasil! Produk dikirim otomatis:");
        await ctx.reply(deliveryText(product, account));
      }

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

function mainMenuKeyboard() {
  return Markup.keyboard([
    ["🛒 List Produk", "💰 Saldo: Rp 0"],
    ["1", "2", "3", "4", "5", "6"],
    ["🧾 Riwayat Transaksi"],
    ["✨ Best Seller", "How To Order ❓"]
  ]).resize();
}

bot.start((ctx) => {
  addUser(ctx.from.id);

bot.hears("🛒 List Produk", async (ctx) => {
  addUser(ctx.from.id);
  await ctx.reply(stockText());
});

bot.hears("💰 Saldo: Rp 0", async (ctx) => {
  const saldo = getBalance(ctx.from.id);

  await ctx.reply(
`━━━━━━━━ 『 SALDO 』
• ID : ${ctx.from.id}
• Username : ${ctx.from.username || "-"}
• Saldo : ${formatRupiah(saldo)}

━━━━━━━━`,
    Markup.inlineKeyboard([
      [Markup.button.callback("💳 TOPUP SALDO", "TOPUP_SALDO")]
    ])
  );
});

bot.hears("🧾 Riwayat Transaksi", async (ctx) => {
  await ctx.reply("🧾 Riwayat transaksi belum tersedia.");
});

bot.hears("✨ Best Seller", async (ctx) => {
  await ctx.reply("✨ Best seller saat ini belum diatur.");
});

bot.hears("How To Order ❓", async (ctx) => {
  await ctx.reply(`Cara order:

1. Klik 🛒 List Produk
2. Pilih nomor produk
3. Pilih metode Pembayaran
4. Bayar
5. Produk dikirim otomatis`);
});

  ctx.reply(
    "Selamat datang di Bot Auto Order!",
    Markup.inlineKeyboard([
      [Markup.button.callback("📦 Order Produk", "ORDER")]
    ])
  );
});

bot.action("ORDER", async (ctx) => {
  addUser(ctx.from.id);
  await ctx.reply(stockText());
});

bot.action("BACK_STOCK", async (ctx) => {
  await ctx.reply(stockText());
});

bot.action("CANCEL", async (ctx) => {
  delete userOrders[ctx.from.id];
  await ctx.reply("Pesanan dibatalkan.");
});

bot.action("SNK", async (ctx) => {
  await ctx.reply(readText(SNK_FILE));
});

bot.hears(/^[0-9]+$/, async (ctx) => {
  addUser(ctx.from.id);

  const number = Number(ctx.message.text);
  const product = getProductByNumber(number);

  if (!product) return;

  const stocks = getStocks();
  const stockCount = stocks[product.id] ? stocks[product.id].length : 0;

  userOrders[ctx.from.id] = {
    productId: product.id
  };

  await ctx.reply(
    `KONFIRMASI PESANAN

Produk: ${product.name}
Stok Tersedia: ${stockCount} pcs
Harga: ${formatRupiah(product.price)}
Deskripsi: ${product.desc}

Silakan pilih metode pembayaran:`,
    paymentKeyboard()
  );
});

bot.action("PAY_QRIS", async (ctx) => {
  try {
    const order = userOrders[ctx.from.id];

    if (!order) {
      return ctx.reply("Silakan pilih produk dulu.");
    }

    const products = getProducts();
    const product = products[order.productId];

    const today = new Date().toLocaleDateString("id-ID");

    await ctx.reply(
      `💳 Silahkan Pilih Metode Pembayaran

Informasi Tagihan
— Total Dibayar: ${formatRupiah(product.price)}
— Date Created: ${today}

Informasi Kamu
— Name: ${ctx.from.first_name || "Anonymous"}
— Saldo Kamu: Rp 0
— User ID: ${ctx.from.id}`,
      Markup.inlineKeyboard([
        [Markup.button.callback("QRIS", "CREATE_QRIS")],
        [Markup.button.callback("Balance", "PAY_SALDO")],
        [Markup.button.callback("Batalkan Pembelian", "CANCEL")]
      ])
    );
  } catch (err) {
    console.error("PAYMENT MENU ERROR:", err.response?.data || err.message);
    ctx.reply("Gagal membuka metode pembayaran.");
  }
});

bot.action("CREATE_QRIS", async (ctx) => {
  try {
    const order = userOrders[ctx.from.id];

    if (!order) {
      return ctx.reply("Silakan pilih produk dulu.");
    }

    await createPayment(ctx, order.productId);
  } catch (err) {
    console.error("CREATE QRIS ERROR:", err.response?.data || err.message);
    ctx.reply("Gagal membuat QRIS. Cek Railway Logs.");
  }
});

bot.action("PAY_SALDO", async (ctx) => {
  await ctx.answerCbQuery("Saldo belum tersedia.");
  await ctx.reply("Fitur balance belum aktif. Silakan gunakan QRIS.");
});

bot.action("TOPUP_SALDO", async (ctx) => {
  await ctx.answerCbQuery();

  await ctx.reply(
`💳 Topup Saldo

Silakan gunakan QRIS untuk mengisi saldo.

Minimal topup: Rp 1.000`
  );
});


/* ================= ADMIN PANEL ================= */

bot.command("admin", async (ctx) => {
  if (!isAdmin(ctx)) return ctx.reply("Anda bukan admin.");

  ctx.reply(`ADMIN PANEL

/addproduk - tambah produk
/listproduk - lihat produk
/delproduk id_produk - hapus produk

/addstock id_produk - tambah stok akun
/setsnk - ubah SNK

/broadcast isi pesan
Kirim foto dengan caption:
/broadcastfoto isi caption`);
});

bot.command("listproduk", async (ctx) => {
  if (!isAdmin(ctx)) return ctx.reply("Anda bukan admin.");

  const products = getProducts();
  const stocks = getStocks();

  const ids = Object.keys(products);

  if (ids.length === 0) {
    return ctx.reply("Belum ada produk.");
  }

  let text = "DAFTAR PRODUK\n\n";

  ids.forEach((id, index) => {
    const p = products[id];
    const stockCount = stocks[id] ? stocks[id].length : 0;

    text += `${index + 1}. ID: ${id}
Nama: ${p.name}
Harga: ${formatRupiah(p.price)}
Stok: ${stockCount}
Desc: ${p.desc}

`;
  });

  ctx.reply(text);
});

bot.command("addproduk", async (ctx) => {
  if (!isAdmin(ctx)) return ctx.reply("Anda bukan admin.");

  adminState[ctx.from.id] = {
    step: "ADD_PRODUCT_NAME",
    data: {}
  };

  ctx.reply("Masukkan nama produk:");
});

bot.command("delproduk", async (ctx) => {
  if (!isAdmin(ctx)) return ctx.reply("Anda bukan admin.");

  const id = ctx.message.text.replace("/delproduk", "").trim();

  if (!id) {
    return ctx.reply("Format: /delproduk id_produk");
  }

  const products = getProducts();
  const stocks = getStocks();

  if (!products[id]) {
    return ctx.reply("Produk tidak ditemukan.");
  }

  delete products[id];
  delete stocks[id];

  writeJSON(PRODUCTS_FILE, products);
  writeJSON(STOCKS_FILE, stocks);

  ctx.reply("Produk berhasil dihapus.");
});

bot.command("addstock", async (ctx) => {
  if (!isAdmin(ctx)) return ctx.reply("Anda bukan admin.");

  const id = ctx.message.text.replace("/addstock", "").trim();

  if (!id) {
    return ctx.reply("Format: /addstock id_produk");
  }

  const products = getProducts();

  if (!products[id]) {
    return ctx.reply("Produk tidak ditemukan.");
  }

  adminState[ctx.from.id] = {
    step: "ADD_STOCK",
    productId: id
  };

  ctx.reply(`Kirim stok akun untuk produk ${products[id].name}

Format:
email|password

Bisa banyak baris:
email1@gmail.com|pass1
email2@gmail.com|pass2`);
});

bot.command("setsnk", async (ctx) => {
  if (!isAdmin(ctx)) return ctx.reply("Anda bukan admin.");

  adminState[ctx.from.id] = {
    step: "SET_SNK"
  };

  ctx.reply("Kirim teks SNK baru:");
});

bot.command("broadcast", async (ctx) => {
  if (!isAdmin(ctx)) return ctx.reply("Anda bukan admin.");

  const text = ctx.message.text.replace("/broadcast", "").trim();

  if (!text) {
    return ctx.reply("Format: /broadcast isi pesan");
  }

  const users = readJSON(USERS_FILE);
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
  if (!isAdmin(ctx)) return;

  const caption = ctx.message.caption || "";

  if (!caption.startsWith("/broadcastfoto")) return;

  const text = caption.replace("/broadcastfoto", "").trim();
  const photo = ctx.message.photo[ctx.message.photo.length - 1].file_id;

  const users = readJSON(USERS_FILE);
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

bot.on("text", async (ctx) => {
  const state = adminState[ctx.from.id];

  if (!state || !isAdmin(ctx)) return;

  const text = ctx.message.text;

  if (state.step === "ADD_PRODUCT_NAME") {
    state.data.name = text;
    state.step = "ADD_PRODUCT_PRICE";
    return ctx.reply("Masukkan harga produk:");
  }

  if (state.step === "ADD_PRODUCT_PRICE") {
    const price = Number(text);

    if (!price || price < 1) {
      return ctx.reply("Harga harus angka.");
    }

    state.data.price = price;
    state.step = "ADD_PRODUCT_DESC";
    return ctx.reply("Masukkan deskripsi produk:");
  }

  if (state.step === "ADD_PRODUCT_DESC") {
    state.data.desc = text;

    const products = getProducts();
    const stocks = getStocks();

    const id = Date.now().toString();

    products[id] = {
      name: state.data.name,
      price: state.data.price,
      desc: state.data.desc
    };

    stocks[id] = [];

    writeJSON(PRODUCTS_FILE, products);
    writeJSON(STOCKS_FILE, stocks);

    delete adminState[ctx.from.id];

    return ctx.reply(`Produk berhasil ditambahkan.

ID Produk:
${id}

Nama: ${state.data.name}
Harga: ${formatRupiah(state.data.price)}
Desc: ${state.data.desc}

Tambahkan stok dengan:
/addstock ${id}`);
  }

  if (state.step === "ADD_STOCK") {
    const lines = text
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.includes("|"));

    if (lines.length === 0) {
      return ctx.reply("Format stok salah. Gunakan email|password");
    }

    const stocks = getStocks();

    if (!stocks[state.productId]) {
      stocks[state.productId] = [];
    }

    stocks[state.productId].push(...lines);
    writeJSON(STOCKS_FILE, stocks);

    delete adminState[ctx.from.id];

    return ctx.reply(`${lines.length} stok berhasil ditambahkan.`);
  }

  if (state.step === "SET_SNK") {
    writeText(SNK_FILE, text);

    delete adminState[ctx.from.id];

    return ctx.reply("SNK berhasil diperbarui.");
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