if (!process.env.BOT_TOKEN) {
  throw new Error("BOT_TOKEN belum terbaca di Railway");
}

const bot = new Telegraf(process.env.BOT_TOKEN.trim());