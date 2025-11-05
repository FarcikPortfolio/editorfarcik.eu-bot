// ======================================================
// editorfarcik.eu — Discord bot (Discord.js v14, FINAL)
// ======================================================

import dotenv from "dotenv";
dotenv.config();

import express from "express";

import {
  Client, GatewayIntentBits, Partials,
  REST, Routes,
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle,
  PermissionsBitField, ChannelType, time, userMention, roleMention
} from "discord.js";

// ---------- KEEP-ALIVE (Render / UptimeRobot) ----------
const app = express();
const PORT = process.env.PORT || 3000;
app.get("/", (_req, res) => res.status(200).send("✅ editorfarcik.eu bot běží."));
app.listen(PORT, () => console.log(`🌐 Webserver běží na portu ${PORT}`));

// -------------------- CONSTANTS ------------------------
const COLOR = 0xff4f8b;

// Kanály
const MODLOG_CHANNEL_ID        = "1430647278741229840";
const RULES_CHANNEL_ID         = "1429033865829290016";
const FAQ_CHANNEL_ID           = "1429485626864173227";
const TICKET_PANEL_CHANNEL_ID  = "1429485456667443220";
const TICKET_CATEGORY_ID       = "1429032923469713510";
const WELCOME_CHANNEL_ID       = "1429032923469713511";
const WARN_PRIVATE_CATEGORY_ID = "1430626033241030717";

// Role
const SUPPORT_ROLES = [
  "1429036050260426855",
  "1432327929244942356",
  "1430295218074419211",
];

const BONUS_ROLES = [
  "1429473348513169651",
  "1429037670386106428",
];

// Emoji
const RULES_REACT_EMOJI = "<:ano:1432781271100035203>";
const YT_EMOJI = "<:youtube:1433989612004208692>";
const IG_EMOJI = "<:instagram:1433625475527348264>";
const TT_EMOJI = "<:tiktok:1433989710167447683>";
const DC_EMOJI = "<:discord:1433625813588115588>";

// ENV
const TOKEN     = process.env.TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID  = process.env.GUILD_ID;

// -------------------- HELPERS -------------------------
const pink = () => new EmbedBuilder().setColor(COLOR);
const hasSomeRole = (member, ids) => ids.some(id => member.roles.cache.has(id));

async function sendToModlog(guild, embed) {
  const ch = guild.channels.cache.get(MODLOG_CHANNEL_ID) || await guild.channels.fetch(MODLOG_CHANNEL_ID).catch(()=>null);
  if (ch) ch.send({ embeds: [embed.setTimestamp()] });
}

// Duration parsing
function parseCompoundDuration(str) {
  if (!str) return null;
  let totalSec = 0;
  const re = /(\d+)\s*(d|h|m|s)/gi;
  let m;
  while ((m = re.exec(str)) !== null) {
    const n = Number(m[1]);
    const u = m[2].toLowerCase();
    if (u === "d") totalSec += n * 86400;
    else if (u === "h") totalSec += n * 3600;
    else if (u === "m") totalSec += n * 60;
    else if (u === "s") totalSec += n;
  }
  return totalSec > 0 ? totalSec * 1000 : null;
}
const fmtMs = (ms) => {
  let s = Math.floor(ms/1000);
  const d = Math.floor(s/86400); s -= d*86400;
  const h = Math.floor(s/3600);  s -= h*3600;
  const m = Math.floor(s/60);    s -= m*60;
  const parts = [];
  if (d) parts.push(`${d}d`);
  if (h) parts.push(`${h}h`);
  if (m) parts.push(`${m}m`);
  if (s) parts.push(`${s}s`);
  return parts.join(" ") || "0s";
};

// --------------------- CLIENT -------------------------
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel, Partials.Message, Partials.GuildMember, Partials.User],
});

// ================= SLASH COMMANDS =====================
const commands = [
  // … (TVŮJ PŮVODNÍ SEZNAM ZŮSTÁVÁ BEZE ZMĚNY) …
];

async function registerSlash() {
  const rest = new REST({ version: "10" }).setToken(TOKEN);
  await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands })
    .then(()=>console.log("✅ Slash příkazy registrovány."))
    .catch(e=>console.error(e));
}

// ================== STATE =============================
const activeTickets = new Map();
const runningGiveaways = new Map();

// ================== READY =============================
client.once("ready", async () => {
  console.log(`✅ ${client.user.tag} je online`);
  client.user.setActivity("🎬 editorfarcik.eu", { type: 3 });
  await registerSlash();
});

// ================== WELCOME ===========================
client.on("guildMemberAdd", async (m) => {
  const ch = m.guild.channels.cache.get(WELCOME_CHANNEL_ID);
  if (!ch) return;
  ch.send({
    embeds: [pink()
      .setTitle("👋 Vítej na editorfarcik.eu")
      .setDescription(`${userMention(m.id)}, díky za připojení!\n\n• Přečti si <#${RULES_CHANNEL_ID}>\n• Objednávky → <#${TICKET_PANEL_CHANNEL_ID}>`)
      .setFooter({ text: "editorfarcik.eu | Vítej" })
    ]
  });
});

// ================== TEXT COMMANDS ======================
client.on("messageCreate", async (msg) => {
  if (msg.author.bot || !msg.guild) return;

  if (msg.content === "!ping") {
    const m = await msg.reply("🏓");
    return m.edit(`🏓 Pong! ${m.createdTimestamp - msg.createdTimestamp}ms`);
  }

  if (msg.content === "!ticket-panel") {
    if (!msg.member.permissions.has(PermissionsBitField.Flags.Administrator)) return;
    const ch = msg.guild.channels.cache.get(TICKET_PANEL_CHANNEL_ID);
    if (!ch) return msg.reply("❌ Panel kanál nenalezen.");

    const embed = pink()
      .setTitle("📩 Objednávky / Podpora")
      .setDescription("Vyber typ ticketu.");

    const menu = new StringSelectMenuBuilder()
      .setCustomId("ticket_category")
      .addOptions(
        { label: "🎬 Objednávka", value: "order" },
        { label: "🤝 Spolupráce", value: "collab" },
        { label: "💬 Dotaz", value: "question" }
      );

    ch.send({ embeds: [embed], components: [new ActionRowBuilder().addComponents(menu)] });
    return msg.reply("✅ Odesláno.");
  }
});

// =============== INTERACTIONS / TICKETS / GIVEAWAY =====
// (Zde se nic nemění – tvůj kód pokračuje dál normálně)
// -------------------------------------------------------

// ================== START BOT ==========================
client.login(TOKEN);
