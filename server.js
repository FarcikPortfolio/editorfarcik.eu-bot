// server.js — editorfarcik.eu bot (Discord.js v14)

// ===== ZÁKLAD + KEEP-ALIVE (Render/UptimeRobot) =====
require("dotenv").config();
const express = require("express");
const app = express();
const port = process.env.PORT || 3000;

app.get("/", (_req, res) => res.status(200).send("✅ editorfarcik.eu bot běží."));
app.listen(port, () => console.log(`🌐 Webserver běží na portu ${port}`));

// ===== DISCORD.JS =====
const {
  Client, GatewayIntentBits, Partials,
  REST, Routes,
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle,
  PermissionsBitField, ChannelType, time, userMention, roleMention
} = require("discord.js");

// ====== ID KONSTANTY ======
const COLOR = 0xff4f8b; // růžová

// Kanály
const MODLOG_CHANNEL_ID        = "1430647278741229840"; // logy moderace
const RULES_CHANNEL_ID         = "1429033865829290016"; // /pravidla cíl
const FAQ_CHANNEL_ID           = "1429485626864173227"; // /faq cíl
const TICKET_PANEL_CHANNEL_ID  = "1429485456667443220"; // kam posílá !ticket-panel
const TICKET_CATEGORY_ID       = "1429032923469713510"; // běžné tickety (objednávky)
const WELCOME_CHANNEL_ID       = "1429032923469713511"; // vítej
const WARN_PRIVATE_CATEGORY_ID = "1430626033241030717"; // privátní varování/appeal kategorie

// Role
const SUPPORT_ROLES = [
  "1429036050260426855",
  "1432327929244942356",
  "1430295218074419211",
];
const BONUS_ROLES = [ // 2x šance ve giveaway
  "1429473348513169651",
  "1429037670386106428"
];

// Emoji (custom reakce na pravidlech)
const RULES_REACT_EMOJI = "<:ano:1432781271100035203>";

// ENV
const GUILD_ID  = process.env.GUILD_ID;
const CLIENT_ID = process.env.CLIENT_ID;
const TOKEN     = process.env.TOKEN;

// ====== HELPERS ======
const pink = () => new EmbedBuilder().setColor(COLOR);
const hasSomeRole = (member, ids) => ids.some(id => member.roles.cache.has(id));

async function sendToModlog(guild, embed) {
  try {
    const ch = guild.channels.cache.get(MODLOG_CHANNEL_ID) || await guild.channels.fetch(MODLOG_CHANNEL_ID).catch(()=>null);
    if (ch) await ch.send({ embeds: [embed.setTimestamp()] });
  } catch {}
}

// Kompozitní duration: "1d 3h 25m"
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

// ====== CLIENT ======
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

// ====== REGISTRACE SLASH PŘÍKAZŮ ======
const commands = [
  // Moderace (role-gate)
  {
    name: "ban",
    description: "Trvalý ban uživatele",
    default_member_permissions: "0",
    options: [
      { name: "uživatel", type: 6, description: "Koho zabanovat", required: true },
      { name: "důvod", type: 3, description: "Důvod", required: false }
    ]
  },
  {
    name: "tempban",
    description: "Dočasný ban",
    default_member_permissions: "0",
    options: [
      { name: "uživatel", type: 6, required: true, description: "Koho zabanovat" },
      { name: "doba", type: 3, required: true, description: "Např. 1d 3h 25m / 2h / 30m" },
      { name: "důvod", type: 3, required: false, description: "Důvod" }
    ]
  },
  {
    name: "kick",
    description: "Vyhození uživatele",
    default_member_permissions: "0",
    options: [
      { name: "uživatel", type: 6, required: true, description: "Koho vyhodit" },
      { name: "důvod", type: 3, required: false, description: "Důvod" }
    ]
  },
  {
    name: "mute",
    description: "Timeout (umlčení) na dobu",
    default_member_permissions: "0",
    options: [
      { name: "uživatel", type: 6, required: true, description: "Koho umlčet" },
      { name: "doba", type: 3, required: true, description: "Např. 1d 3h 25m / 2h / 30m" },
      { name: "důvod", type: 3, required: false, description: "Důvod" }
    ]
  },
  {
    name: "tempmute",
    description: "Alias pro mute (stejné chování)",
    default_member_permissions: "0",
    options: [
      { name: "uživatel", type: 6, required: true, description: "Koho umlčet" },
      { name: "doba", type: 3, required: true, description: "Např. 1d 3h 25m / 2h / 30m" },
      { name: "důvod", type: 3, required: false, description: "Důvod" }
    ]
  },
  {
    name: "warn",
    description: "Upozornit uživatele (DM + log)",
    default_member_permissions: "0",
    options: [
      { name: "uživatel", type: 6, required: true, description: "Koho varovat" },
      { name: "důvod", type: 3, required: true, description: "Důvod varování" }
    ]
  },
  // Report (vidí všichni)
  {
    name: "report",
    description: "Nahlásit uživatele (vidí všichni)",
    options: [
      { name: "uživatel", type: 6, required: true, description: "Koho hlásíš" },
      { name: "důvod", type: 3, required: true, description: "Co provedl" }
    ]
  },
  // Pravidla (role-gate)
  {
    name: "pravidla",
    description: "Pošle embed s pravidly serveru do určeného kanálu",
    default_member_permissions: "0"
  },
  // FAQ (role-gate)
  {
    name: "faq",
    description: "Pošle embed s často kladenými otázkami do určeného kanálu",
    default_member_permissions: "0"
  },
  // Ticket (role-gate)
  {
    name: "ticket",
    description: "Správa ticketů",
    default_member_permissions: "0",
    options: [{ type: 1, name: "create", description: "Otevřít ticket ručně (pro support role)" }]
  },
  // Giveaway (role-gate)
  {
    name: "giveaway",
    description: "Správa giveaway",
    default_member_permissions: "0",
    options: [{ type: 1, name: "create", description: "Vytvořit novou giveaway (modal)" }]
  },
];

async function registerSlash() {
  const rest = new REST({ version: "10" }).setToken(TOKEN);
  await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
  console.log("✅ Slash příkazy registrovány");
}

// ====== STAVY ======
const activeTickets = new Map(); // channelId -> userId
const runningGiveaways = new Map(); // messageId -> { entrants:Set, endsAt, winners, prize, channelId }

// ====== READY ======
client.once("ready", async () => {
  console.log(`✅ ${client.user.tag} je online`);
  client.user.setActivity("🎬 editorfarcik.eu", { type: 3 });
  try { await registerSlash(); } catch (e) { console.error("Slash registrace selhala:", e?.message || e); }
});

// ====== WELCOME ======
client.on("guildMemberAdd", async (m) => {
  const ch = m.guild.channels.cache.get(WELCOME_CHANNEL_ID) || await m.guild.channels.fetch(WELCOME_CHANNEL_ID).catch(()=>null);
  if (!ch) return;
  const e = pink()
    .setTitle("👋 Vítej na editorfarcik.eu")
    .setDescription(`${userMention(m.id)}, díky za připojení!\n\n• Mrkni na **#pravidla** a drž se tématu.\n• Potřebuješ edit? Ticket panel je v kanálu <#${TICKET_PANEL_CHANNEL_ID}>.\n• Máš dotaz? Vytvoř si ticket.`)
    .setFooter({ text: "editorfarcik.eu | Vítej" });
  ch.send({ embeds: [e] }).catch(()=>{});
});

// ====== TEXT COMMANDS ======
client.on("messageCreate", async (msg) => {
  if (msg.author.bot || !msg.guild) return;

  // !ping
  if (msg.content.trim().toLowerCase() === "!ping") {
    const m = await msg.reply("🏓");
    const rtt = m.createdTimestamp - msg.createdTimestamp;
    return m.edit(`🏓 Pong! ${rtt}ms`);
  }

  // !ticket-panel (jen admin)
  if (msg.content.trim().toLowerCase() === "!ticket-panel") {
    if (!msg.member.permissions.has(PermissionsBitField.Flags.Administrator)) return;
    const panelChannel = msg.guild.channels.cache.get(TICKET_PANEL_CHANNEL_ID) || await msg.guild.channels.fetch(TICKET_PANEL_CHANNEL_ID).catch(()=>null);
    if (!panelChannel) return msg.reply("❌ Kanál pro panel nenalezen.");

    const embed = pink()
      .setTitle("📩 Objednávky")
      .setDescription("Vyber typ ticketu.\n\n⚠️ *Tento systém je určen pro objednávky a dotazy ohledně editů.*")
      .setFooter({ text: "editorfarcik.eu | Podpora ticketu" });

    const menu = new StringSelectMenuBuilder()
      .setCustomId("ticket_category")
      .setPlaceholder("🧾 Vyber typ ticketu")
      .addOptions(
        { label: "🎬 Objednávka editu", description: "Chci objednat edit.", value: "order" },
        { label: "🤝 Spolupráce", description: "Mám zájem o spolupráci.", value: "collab" },
        { label: "💬 Dotaz / poradenství", description: "Potřebuji poradit.", value: "question" },
      );

    await panelChannel.send({ embeds: [embed], components: [new ActionRowBuilder().addComponents(menu)] });
    if (msg.channel.id !== panelChannel.id) await msg.reply("✅ Ticket panel byl odeslán.");
  }
});

// ====== SELECT -> MODAL (ticket panel) ======
client.on("interactionCreate", async (it) => {
  if (!it.isStringSelectMenu() || it.customId !== "ticket_category") return;
  const type = it.values[0];

  const modal = new ModalBuilder()
    .setCustomId(`ticket_form_${type}`)
    .setTitle("🎫 Nový ticket");

  const name    = new TextInputBuilder().setCustomId("name").setLabel("Tvoje jméno nebo přezdívka").setStyle(TextInputStyle.Short).setRequired(true);
  const contact = new TextInputBuilder().setCustomId("contact").setLabel("Kontakt").setStyle(TextInputStyle.Short).setRequired(true);
  const details = new TextInputBuilder().setCustomId("details").setStyle(TextInputStyle.Paragraph).setRequired(true);

  if (type === "order")      details.setLabel("Popiš, co chceš upravit").setPlaceholder("Např. cinematic edit s hudbou a efekty…");
  else if (type === "collab")details.setLabel("O jakou spolupráci máš zájem?").setPlaceholder("Např. dlouhodobá spolupráce na editech…");
  else                       details.setLabel("Popiš, o co jde").setPlaceholder("S čím potřebuješ poradit?");

  modal.addComponents(
    new ActionRowBuilder().addComponents(name),
    new ActionRowBuilder().addComponents(details),
    new ActionRowBuilder().addComponents(contact),
  );

  await it.showModal(modal);
});

// ====== MODAL SUBMIT -> CREATE TICKET ======
client.on("interactionCreate", async (it) => {
  if (!it.isModalSubmit() || !it.customId.startsWith("ticket_form_")) return;

  const type = it.customId.replace("ticket_form_", "");
  const guild = it.guild ?? (await client.guilds.fetch(GUILD_ID));
  const category = guild.channels.cache.get(TICKET_CATEGORY_ID) || await guild.channels.fetch(TICKET_CATEGORY_ID).catch(()=>null);
  if (!category) return it.reply({ content: "❌ Kategorie pro tickety nenalezena.", ephemeral: true });

  const name = it.fields.getTextInputValue("name");
  const contact = it.fields.getTextInputValue("contact");
  const details = it.fields.getTextInputValue("details");

  const map = {
    order:    { text: "Objednávka editu", icon: "🎬", slug: "objednavka" },
    collab:   { text: "Spolupráce",       icon: "🤝", slug: "spoluprace" },
    question: { text: "Dotaz / poradenství", icon: "💬", slug: "dotaz" },
  };
  const t = map[type] || { text: "Ticket", icon: "🎟️", slug: "ticket" };

  const ch = await guild.channels.create({
    name: `${t.icon}│${t.slug}-${it.user.username}`.toLowerCase(),
    type: ChannelType.GuildText,
    parent: category.id,
    permissionOverwrites: [
      { id: guild.roles.everyone, deny: [PermissionsBitField.Flags.ViewChannel] },
      { id: it.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
      { id: client.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
      ...SUPPORT_ROLES.map(rid => ({ id: rid, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] })),
    ],
  });

  const emb = pink()
    .setTitle("🎟️ Nový ticket")
    .setDescription(`**Kategorie:** ${t.text}\n**Uživatel:** ${it.user}\n\n**Jméno:** ${name}\n**Kontakt:** ${contact}\n**Detail:** ${details}`)
    .setFooter({ text: "editorfarcik.eu | Podpora ticketu" });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("take_ticket").setStyle(ButtonStyle.Success).setLabel("✅ Převzít"),
    new ButtonBuilder().setCustomId("close_ticket").setStyle(ButtonStyle.Danger).setLabel("🔒 Zavřít ticket"),
  );

  await ch.send({ content: `<@${it.user.id}>`, embeds: [emb], components: [row] });
  await it.reply({ content: `✅ Ticket vytvořen: ${ch}`, ephemeral: true });
});

// ====== Ticket tlačítka ======
client.on("interactionCreate", async (it) => {
  if (!it.isButton()) return;

  if (it.customId === "take_ticket") {
    const can = hasSomeRole(it.member, SUPPORT_ROLES);
    if (!can) return it.reply({ content: "❌ Nemáš oprávnění převzít tento ticket.", ephemeral: true });

    const current = activeTickets.get(it.channel.id);
    if (current === it.user.id) {
      activeTickets.delete(it.channel.id);
      return it.reply({ content: `🚫 ${it.user} se vzdal ticketu.`, ephemeral: true });
    } else {
      activeTickets.set(it.channel.id, it.user.id);
      return it.reply({ content: `✅ Ticket převzal: ${it.user}`, ephemeral: true });
    }
  }

  if (it.customId === "close_ticket") {
    await it.reply({ content: "🔒 Ticket se uzavře za 5 sekund…", ephemeral: true });
    setTimeout(() => it.channel.delete().catch(()=>{}), 5000);
  }
});

// ====== DM → „Kontaktovat podporu“ tlačítko z /warn ======
client.on("interactionCreate", async (it) => {
  if (!it.isButton() || it.customId !== "open_support_from_warn") return;

  const guild = await client.guilds.fetch(GUILD_ID);
  const member = await guild.members.fetch(it.user.id).catch(()=>null);
  const category = guild.channels.cache.get(WARN_PRIVATE_CATEGORY_ID) || await guild.channels.fetch(WARN_PRIVATE_CATEGORY_ID).catch(()=>null);
  if (!member || !category) return it.reply({ content: "❌ Nelze vytvořit ticket.", ephemeral: true });

  const ch = await guild.channels.create({
    name: "│・📩│podpora",
    type: ChannelType.GuildText,
    parent: category.id,
    permissionOverwrites: [
      { id: guild.roles.everyone, deny: [PermissionsBitField.Flags.ViewChannel] },
      { id: it.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
      ...SUPPORT_ROLES.map(rid => ({ id: rid, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] })),
      { id: client.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
    ],
  });

  await ch.send({
    content: `<@${it.user.id}>`,
    embeds: [pink().setTitle("📨 Ticket z varování").setDescription("Napiš prosím, co potřebuješ k varování dořešit.").setFooter({ text: "editorfarcik.eu | Podpora ticketu" })]
  });

  await it.reply({ content: `✅ Otevřel jsem ticket: ${ch}`, ephemeral: true });
});

// ====== SLASH HANDLERY ======
client.on("interactionCreate", async (it) => {
  if (!it.isChatInputCommand()) return;

  const isSupportCmd = ["ban","tempban","kick","mute","tempmute","warn","ticket","giveaway","pravidla","faq"].includes(it.commandName);
  if (isSupportCmd && !hasSomeRole(it.member, SUPPORT_ROLES)) {
    return it.reply({ content: "❌ Nemáš oprávnění pro tento příkaz.", ephemeral: true });
  }

  // ----- /pravidla (přesně text + auto reakce)
  if (it.commandName === "pravidla") {
    const ch = it.guild.channels.cache.get(RULES_CHANNEL_ID) || await it.guild.channels.fetch(RULES_CHANNEL_ID).catch(()=>null);
    if (!ch) return it.reply({ content: "❌ Kanál s pravidly nenalezen.", ephemeral: true });

    const e = pink()
      .setTitle("📜 Pravidla serveru editorfarcik.eu")
      .setDescription([
        "Vítej v **editorfarcik.eu!** Prosím všechny o dodržování všech těchto pravidel.",
        "**Neznalost pravidel neomlouvá!**",
        "",
        "I. 🚫 **Žádný spam nebo flood**",
        "• Neposílej opakovaně stejnou zprávu nebo zbytečné reakce/emotikony.",
        "",
        "II. 👑 **Žádné urážky, rasismus nebo toxické chování**",
        "• Buď respektující vůči ostatním, žádný hate, homofobie ani urážky.",
        "",
        "III. 📢 **Zákaz reklamy a propagace**",
        "• Nešiř své servery, odkazy nebo sociální sítě bez povolení.",
        "",
        "IV. 🛡 **Respektuj moderátory**",
        "• Rozhodnutí adminů a moderátorů jsou finální. Nepokoušej se je obejít.",
        "",
        "V. ✅ **Vhodný obsah**",
        "• Žádný NSFW obsah, viry, exploity ani cokoliv nelegálního.",
        "",
        "VI. 🔒 **Zákaz podvodů (scamování)**",
        "• Jakýkoliv pokus o podvod vede k okamžitému banu.",
        "",
        "VII. 📏 **Dodržuj pravidla Discordu**",
        "• Discord ToS • Pravidla komunity Discordu",
        "",
        "Porušením pravidel riskuješ mute, kick nebo ban – i bez předchozího varování."
      ].join("\n"))
      .setFooter({ text: "editorfarcik.eu | Pravidla serveru" });

    const sent = await ch.send({ embeds: [e] });
    await sent.react(RULES_REACT_EMOJI).catch(()=>{});
    return it.reply({ content: "✅ Pravidla odeslána + přidána reakce.", ephemeral: true });
  }

  // ----- /faq (poslat do FAQ channelu)
  if (it.commandName === "faq") {
    const faqChannel = it.guild.channels.cache.get(FAQ_CHANNEL_ID) || await it.guild.channels.fetch(FAQ_CHANNEL_ID).catch(()=>null);
    if (!faqChannel) return it.reply({ content: "❌ FAQ kanál nenalezen.", ephemeral: true });

    const faqEmbed = pink()
      .setTitle("❓ Často kladené otázky")
      .setDescription([
        "**Kolik střih videa stojí?**",
        "Cena není fixní. Záleží na délce videa, stylu efektů, náročnosti a deadline. Pošleš ukázku videa + styl, řeknu cenu.",
        "",
        "**Jak dlouho střih videa zabere?**",
        "Standardně 1–7 dní podle náročnosti. Rychlejší termíny jdou, ale platí se příplatek. (z důvodu studování)",
        "",
        "**V jakém formátu odevzdáváš?**",
        "MP4 (H.264/H.265), 1080p/4K podle domluvy. Vše optimalizované pro platformu.",
        "",
        "**Děláš i thumbnaily/miniatury?**",
        "Ano, ale je to extra položka za menší příplatek.",
        "",
        "**Způsob platby?**",
        "Převodem na bankovní účet.",
        "",
        "**Co když se mi to nelíbí?**",
        "Řekneš mi přesně co se ti nelíbí a já to upravím podle tvých představ."
      ].join("\n"))
      .setFooter({ text: "editorfarcik.eu | FAQ" });

    await faqChannel.send({ embeds: [faqEmbed] });
    return it.reply({ content: "✅ FAQ odesláno do určeného kanálu.", ephemeral: true });
  }

  // ----- /report (vidí všichni, log do modlogu)
  if (it.commandName === "report") {
    const user = it.options.getUser("uživatel", true);
    const reason = it.options.getString("důvod", true);
    const emb = pink()
      .setTitle("🚨 Report")
      .setDescription(`**Nahlásil:** ${it.user}\n**Nahlášený:** ${user}\n**Důvod:** ${reason}\n**Čas:** ${time(Math.floor(Date.now()/1000))}`)
      .setFooter({ text: "editorfarcik.eu | Moderace systému" });
    await sendToModlog(it.guild, emb);
    return it.reply({ content: "✅ Díky, nahlášení jsme přijali.", ephemeral: true });
  }

  // ----- Moderace (role-gate výše)
  if (it.commandName === "warn") {
    const user = it.options.getUser("uživatel", true);
    const reason = it.options.getString("důvod", true);

    // DM warn + tlačítko
    try {
      const dmEmbed = pink()
        .setTitle("⚠️ Varování")
        .setDescription(`Byl jsi varován na serveru **editorfarcik.eu**.\n**Důvod:** ${reason}`)
        .setFooter({ text: "editorfarcik.eu | Podpora varování" });
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("open_support_from_warn").setStyle(ButtonStyle.Primary).setLabel("📩 Kontaktovat podporu")
      );
      const u = await client.users.fetch(user.id);
      await u.send({ embeds: [dmEmbed], components: [row] }).catch(()=>{});
    } catch {}

    const log = pink().setTitle("⚠️ Varování uděleno")
      .setDescription(`**Moderátor:** ${it.user}\n**Uživatel:** ${user}\n**Důvod:** ${reason}`)
      .setFooter({ text: "editorfarcik.eu | Moderace systému" });
    await sendToModlog(it.guild, log);
    return it.reply({ content: "✅ Upozornění odesláno a zalogováno.", ephemeral: true });
  }

  if (it.commandName === "ban") {
    const user = it.options.getUser("uživatel", true);
    const reason = it.options.getString("důvod") || "Neuvedeno";
    const member = await it.guild.members.fetch(user.id).catch(()=>null);
    if (!member) return it.reply({ content: "❌ Uživatel není na serveru.", ephemeral: true });
    await member.ban({ reason }).catch(e=> it.reply({ content: `❌ Nepovedlo se: ${e?.message||e}`, ephemeral:true }));
    await sendToModlog(it.guild, pink().setTitle("🔨 Ban").setDescription(`**Moderátor:** ${it.user}\n**Uživatel:** ${user}\n**Důvod:** ${reason}`).setFooter({ text:"editorfarcik.eu | Moderace systému" }));
    return it.reply({ content: "✅ Zabanován.", ephemeral: true });
  }

  if (it.commandName === "tempban") {
    const user = it.options.getUser("uživatel", true);
    const reason = it.options.getString("důvod") || "Neuvedeno";
    const durStr = it.options.getString("doba", true);
    const ms = parseCompoundDuration(durStr);
    if (!ms) return it.reply({ content: "❌ Špatný formát doby. Použij např. `1d 3h 25m`, `2h`, `30m`.", ephemeral: true });

    const member = await it.guild.members.fetch(user.id).catch(()=>null);
    if (!member) return it.reply({ content: "❌ Uživatel není na serveru.", ephemeral: true });
    await member.ban({ reason }).catch(e=> it.reply({ content: `❌ Nepovedlo se: ${e?.message||e}`, ephemeral:true }));

    setTimeout(async () => {
      await it.guild.members.unban(user.id, "Vypršel tempban").catch(()=>{});
    }, ms);

    await sendToModlog(it.guild, pink().setTitle("⏳ Tempban").setDescription(`**Moderátor:** ${it.user}\n**Uživatel:** ${user}\n**Doba:** ${fmtMs(ms)}\n**Důvod:** ${reason}`).setFooter({ text:"editorfarcik.eu | Moderace systému" }));
    return it.reply({ content: "✅ Dočasný ban udělen.", ephemeral: true });
  }

  if (it.commandName === "kick") {
    const user = it.options.getUser("uživatel", true);
    const reason = it.options.getString("důvod") || "Neuvedeno";
    const member = await it.guild.members.fetch(user.id).catch(()=>null);
    if (!member) return it.reply({ content: "❌ Uživatel není na serveru.", ephemeral: true });
    await member.kick(reason).catch(e=> it.reply({ content: `❌ Nepovedlo se: ${e?.message||e}`, ephemeral:true }));
    await sendToModlog(it.guild, pink().setTitle("🥾 Kick").setDescription(`**Moderátor:** ${it.user}\n**Uživatel:** ${user}\n**Důvod:** ${reason}`).setFooter({ text:"editorfarcik.eu | Moderace systému" }));
    return it.reply({ content: "✅ Vyhozen.", ephemeral: true });
  }

  if (it.commandName === "mute" || it.commandName === "tempmute") {
    const user = it.options.getUser("uživatel", true);
    const reason = it.options.getString("důvod") || "Neuvedeno";
    const durStr = it.options.getString("doba", true);
    const ms = parseCompoundDuration(durStr);
    if (!ms) return it.reply({ content: "❌ Špatný formát doby. Použij `1d 3h 25m` / `2h` / `30m`…", ephemeral: true });

    const member = await it.guild.members.fetch(user.id).catch(()=>null);
    if (!member) return it.reply({ content: "❌ Uživatel není na serveru.", ephemeral: true });
    await member.timeout(ms, reason).catch(e=> it.reply({ content: `❌ Nepovedlo se: ${e?.message||e}`, ephemeral:true }));

    await sendToModlog(it.guild, pink().setTitle("🔇 Timeout").setDescription(`**Moderátor:** ${it.user}\n**Uživatel:** ${user}\n**Doba:** ${fmtMs(ms)}\n**Důvod:** ${reason}`).setFooter({ text:"editorfarcik.eu | Moderace systému" }));
    return it.reply({ content: "✅ Timeout nastaven.", ephemeral: true });
  }

  // ----- /ticket create
  if (it.commandName === "ticket" && it.options.getSubcommand() === "create") {
    const category = it.guild.channels.cache.get(TICKET_CATEGORY_ID) || await it.guild.channels.fetch(TICKET_CATEGORY_ID).catch(()=>null);
    if (!category) return it.reply({ content: "❌ Kategorie nenalezena.", ephemeral: true });

    const ch = await it.guild.channels.create({
      name: `🎟│ticket-${it.user.username}`.toLowerCase(),
      type: ChannelType.GuildText,
      parent: category.id,
      permissionOverwrites: [
        { id: it.guild.roles.everyone, deny: [PermissionsBitField.Flags.ViewChannel] },
        { id: it.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
        ...SUPPORT_ROLES.map(rid => ({ id: rid, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] })),
      ],
    });
    await ch.send({ embeds: [pink().setTitle("🎟️ Ticket vytvořen").setDescription(`Ticket otevřel ${it.user}`).setFooter({ text:"editorfarcik.eu | Podpora ticketu" })] });
    return it.reply({ content: `✅ Ticket: ${ch}`, ephemeral: true });
  }

  // ----- /giveaway create (modal)
  if (it.commandName === "giveaway" && it.options.getSubcommand() === "create") {
    const modal = new ModalBuilder().setCustomId("gw_create_modal").setTitle("🎉 Vytvořit giveaway");
    const prize    = new TextInputBuilder().setCustomId("gw_prize").setLabel("Co se vyhrává?").setRequired(true).setStyle(TextInputStyle.Short);
    const winners  = new TextInputBuilder().setCustomId("gw_winners").setLabel("Počet výherců").setRequired(true).setStyle(TextInputStyle.Short).setPlaceholder("např. 1");
    const duration = new TextInputBuilder().setCustomId("gw_duration").setLabel("Doba trvání").setRequired(true).setStyle(TextInputStyle.Short).setPlaceholder("např. 1d 3h 25m / 2h / 30m");

    modal.addComponents(
      new ActionRowBuilder().addComponents(prize),
      new ActionRowBuilder().addComponents(winners),
      new ActionRowBuilder().addComponents(duration),
    );
    return it.showModal(modal);
  }
});

// ====== Giveaway modal -> vytvoření
client.on("interactionCreate", async (it) => {
  if (!it.isModalSubmit() || it.customId !== "gw_create_modal") return;

  const prize = it.fields.getTextInputValue("gw_prize");
  const winnersCount = Math.max(1, parseInt(it.fields.getTextInputValue("gw_winners") || "1", 10));
  const durStr = it.fields.getTextInputValue("gw_duration");
  const ms = parseCompoundDuration(durStr);
  if (!ms) return it.reply({ content: "❌ Špatný formát doby. Použij `1d 3h 25m`, `2h`, `30m`…", ephemeral: true });

  const ends = Date.now() + ms;
  const joinBtn = new ButtonBuilder().setCustomId("gw_join").setLabel("🎉 Přihlásit se").setStyle(ButtonStyle.Success);
  const e = pink()
    .setTitle("🎉 Giveaway")
    .setDescription([
      `**Cena:** ${prize}`,
      `**Počet výherců:** ${winnersCount}`,
      `**Končí:** ${time(Math.floor(ends/1000), "R")}`,
      `👥 **Počet účastníků:** 0`,
      `\nRole s větší šancí: ${BONUS_ROLES.map(roleMention).join(", ")} (2×)`,
    ].join("\n"))
    .setFooter({ text: "editorfarcik.eu | Giveaway" });

  const msg = await it.channel.send({ embeds: [e], components: [new ActionRowBuilder().addComponents(joinBtn)] });
  runningGiveaways.set(msg.id, { entrants: new Set(), endsAt: ends, winners: winnersCount, prize, channelId: msg.channel.id });

  setTimeout(async () => {
    const gw = runningGiveaways.get(msg.id);
    if (!gw) return;

    const entries = [...gw.entrants];
    if (!entries.length) {
      await msg.reply({ embeds: [pink().setTitle("🎉 Giveaway").setDescription("Nikdo se nepřihlásil.").setFooter({ text:"editorfarcik.eu | Giveaway" })] });
      runningGiveaways.delete(msg.id);
      return;
    }

    const guild = await client.guilds.fetch(GUILD_ID);
    const weighted = [];
    for (const id of entries) {
      const m = await guild.members.fetch(id).catch(()=>null);
      if (!m) continue;
      weighted.push(id);
      if (hasSomeRole(m, BONUS_ROLES)) weighted.push(id); // 2× šance
    }

    const winners = [];
    while (winners.length < gw.winners && weighted.length) {
      const pick = weighted[Math.floor(Math.random()*weighted.length)];
      if (!winners.includes(pick)) winners.push(pick);
    }

    const wText = winners.length ? winners.map(userMention).join(", ") : "nikdo";
    await msg.reply({ embeds: [pink().setTitle("🥳 Výherci").setDescription(`**Výhra:** ${gw.prize}\n**Výherci:** ${wText}`).setFooter({ text:"editorfarcik.eu | Giveaway" })] });
    runningGiveaways.delete(msg.id);
  }, ms);

  return it.reply({ content: "✅ Giveaway založena.", ephemeral: true });
});

// klik na „Přihlásit se“
client.on("interactionCreate", async (it) => {
  if (!it.isButton() || it.customId !== "gw_join") return;
  const gw = runningGiveaways.get(it.message.id);
  if (!gw) return it.reply({ content: "❌ Tahle giveaway už neexistuje.", ephemeral: true });

  if (gw.entrants.has(it.user.id)) {
    return it.reply({ content: "⚠️ Už jsi přihlášen do této giveaway.", ephemeral: true });
  }
  gw.entrants.add(it.user.id);

  // aktualizuj počet účastníků v embedu
  const old = it.message.embeds?.[0];
  if (old) {
    const emb = EmbedBuilder.from(old);
    const desc = emb.data.description || "";
    const updated = desc.replace(/Počet účastníků:\s*\d+/i, `Počet účastníků: ${gw.entrants.size}`);
    emb.setDescription(updated);
    await it.message.edit({ embeds: [emb] }).catch(()=>{});
  }

  return it.reply({ content: "🎉 Byl jsi úspěšně přihlášen do giveaway!", ephemeral: true });
});

// ====== START ======
client.login(TOKEN);
