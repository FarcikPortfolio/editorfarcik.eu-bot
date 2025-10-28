// server.js — editorfarcik.eu bot (Discord.js v14)

// ===== ZÁKLAD + KEEP-ALIVE =====
require("dotenv").config();
const express = require("express");
const app = express();
const port = process.env.PORT || 3000;

app.get("/", (req, res) => res.status(200).send("✅ Bot běží"));
app.listen(port, () => console.log(`🌐 Webserver běží na portu ${port}`));

// ===== DISCORD.JS =====
const {
  Client, GatewayIntentBits, Partials,
  REST, Routes,
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle,
  PermissionsBitField, ChannelType, time, userMention, roleMention
} = require("discord.js");

// ====== KONSTANTY (ID) ======
const COLOR = 0xff4f8b; // růžová
const MODLOG_CHANNEL_ID = "1430647278741229840";
const DISCORD_INFO_CHANNEL_ID = "1429033865829290016";
const TICKET_PANEL_CHANNEL_ID = "1429485456667443220";
const TICKET_CATEGORY_ID = "1429032923469713510";
const WELCOME_CHANNEL_ID = "1429032923469713511";
const SUPPORT_ROLES = ["1429036050260426855","1432327929244942356","1430295218074419211"];
const BONUS_ROLES = ["1429473348513169651","1429037670386106428"];

const GUILD_ID = process.env.GUILD_ID;
const CLIENT_ID = process.env.CLIENT_ID;
const TOKEN = process.env.TOKEN;

// ====== POMOCNÉ FUNKCE ======
const hasSomeRole = (member, ids) => ids.some(id => member.roles.cache.has(id));
const pink = () => new EmbedBuilder().setColor(COLOR);
const logEmbed = async (guild, embed) => {
  const ch = guild.channels.cache.get(MODLOG_CHANNEL_ID) || await guild.channels.fetch(MODLOG_CHANNEL_ID).catch(()=>null);
  if (ch) ch.send({ embeds: [embed.setTimestamp()] }).catch(()=>{});
};

// d: "1h", "30m", "10s", "2d"
const parseDuration = (str) => {
  if (!str) return null;
  const m = String(str).trim().match(/^(\d+)\s*([smhd])$/i);
  if (!m) return null;
  const n = Number(m[1]);
  const k = m[2].toLowerCase();
  const mult = k === "s" ? 1 : k === "m" ? 60 : k === "h" ? 3600 : 86400;
  return n * mult * 1000;
};
const fmtMs = (ms) => {
  const s = Math.floor(ms/1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s/60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m/60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h/24);
  return `${d}d`;
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

// ====== REGISTRACE SLASH ======
const commands = [
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
      { name: "doba", type: 3, required: true, description: "Např. 30m / 2h / 1d" },
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
    description: "Tichý timeout (max 28 dní)",
    default_member_permissions: "0",
    options: [
      { name: "uživatel", type: 6, required: true, description: "Koho umlčet" },
      { name: "doba", type: 3, required: true, description: "Např. 30m / 2h / 1d" },
      { name: "důvod", type: 3, required: false, description: "Důvod" }
    ]
  },
  {
    name: "tempmute",
    description: "Alias mute",
    default_member_permissions: "0",
    options: [
      { name: "uživatel", type: 6, required: true, description: "Koho umlčet" },
      { name: "doba", type: 3, required: true, description: "Např. 30m / 2h / 1d" },
      { name: "důvod", type: 3, required: false, description: "Důvod" }
    ]
  },
  {
    name: "report",
    description: "Nahlásit uživatele (vidí všichni)",
    options: [
      { name: "uživatel", type: 6, required: true, description: "Koho hlásíš" },
      { name: "důvod", type: 3, required: true, description: "Co provedl" }
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
  {
    name: "discord",
    description: "Pošle info embed do kanálu s pravidly/info (předem daný ID)"
  },
  {
    name: "giveaway",
    description: "Správa giveaway",
    options: [
      {
        type: 1, name: "create", description: "Vytvořit novou giveaway (modal)"
      }
    ]
  },
  {
    name: "ticket",
    description: "Správa ticketů",
    options: [
      { type: 1, name: "create", description: "Otevřít ticket někomu ručně (pro support role)" }
    ]
  },
];

async function registerSlash() {
  const rest = new REST({ version: "10" }).setToken(TOKEN);
  await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
  console.log("✅ Slash příkazy registrovány");
}

// ====== STAV „Převzít“ + Giveaway registr ======
const activeTickets = new Map(); // channelId -> userId
const runningGiveaways = new Map(); // messageId -> { entrants:Set<string>, endsAt:ms, winners, prize, channelId }

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
    .setDescription(`${userMention(m.id)}, díky za připojení!\n\n• Mrkni na pravidla, drž se tématu a buď normální člověk.\n• Potřebuješ edit? Ticket panel je v příslušném kanálu.\n• Když cokoliv, pingni support.`)
    .setFooter({ text: "editorfarcik.eu | Vítej" });
  ch.send({ embeds: [e] }).catch(()=>{});
});

// ====== TEXT COMMANDS ======
client.on("messageCreate", async (msg) => {
  if (msg.author.bot || !msg.guild) return;

  // !ping
  if (msg.content.trim().toLowerCase() === "!ping") {
    const sent = await msg.reply("🏓");
    sent.edit(`🏓 Pong! ${sent.createdTimestamp - msg.createdTimestamp}ms`);
    return;
  }

  // !ticket-panel (jen pro adminy)
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

  const name = new TextInputBuilder().setCustomId("name").setLabel("Tvoje jméno nebo přezdívka").setStyle(TextInputStyle.Short).setRequired(true);
  const contact = new TextInputBuilder().setCustomId("contact").setLabel("Kontakt").setStyle(TextInputStyle.Short).setRequired(true);
  const details = new TextInputBuilder().setCustomId("details").setStyle(TextInputStyle.Paragraph).setRequired(true);

  if (type === "order") { details.setLabel("Popiš, co chceš upravit").setPlaceholder("Např. chci cinematic edit s hudbou a efekty…"); }
  else if (type === "collab") { details.setLabel("O jakou spolupráci máš zájem?").setPlaceholder("Např. dlouhodobá spolupráce na editech…"); }
  else { details.setLabel("Popiš, o co jde").setPlaceholder("S čím potřebuješ poradit?"); }

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

  const typeMap = {
    order: { text: "Objednávka editu", icon: "🎬", slug: "objednavka" },
    collab: { text: "Spolupráce", icon: "🤝", slug: "spoluprace" },
    question: { text: "Dotaz / poradenství", icon: "💬", slug: "dotaz" },
  };
  const t = typeMap[type] || { text: "Ticket", icon: "🎟️", slug: "ticket" };

  const name = it.fields.getTextInputValue("name");
  const contact = it.fields.getTextInputValue("contact");
  const details = it.fields.getTextInputValue("details");

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

// ====== Support z DM warnu ======
client.on("interactionCreate", async (it) => {
  if (!it.isButton() || it.customId !== "open_support_from_warn") return;
  const guild = await client.guilds.fetch(GUILD_ID);
  const member = await guild.members.fetch(it.user.id).catch(()=>null);
  const category = guild.channels.cache.get(TICKET_CATEGORY_ID) || await guild.channels.fetch(TICKET_CATEGORY_ID).catch(()=>null);
  if (!member || !category) return it.reply({ content: "❌ Nelze vytvořit ticket.", ephemeral: true });

  const ch = await guild.channels.create({
    name: `⚠│varovani-${it.user.username}`.toLowerCase(),
    type: ChannelType.GuildText,
    parent: category.id,
    permissionOverwrites: [
      { id: guild.roles.everyone, deny: [PermissionsBitField.Flags.ViewChannel] },
      { id: it.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
      ...SUPPORT_ROLES.map(rid => ({ id: rid, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] })),
    ],
  });

  await ch.send({ content: `<@${it.user.id}>`, embeds: [pink().setTitle("📨 Ticket z varování").setDescription("Napiš prosím, co potřebuješ k varování doplnit/řešit.").setFooter({ text: "editorfarcik.eu | Podpora ticketu" })] });
  await it.reply({ content: `✅ Otevřel jsem ticket: ${ch}`, ephemeral: true });
});

// ====== SLASH HANDLERY ======
client.on("interactionCreate", async (it) => {
  if (!it.isChatInputCommand()) return;

  // role gate helper
  const needSupport = () => {
    if (!hasSomeRole(it.member, SUPPORT_ROLES)) {
      it.reply({ content: "❌ Nemáš oprávnění pro tento příkaz.", ephemeral: true });
      return false;
    }
    return true;
  };

  // ----- /discord
  if (it.commandName === "discord") {
    const guild = it.guild;
    const ch = guild.channels.cache.get(DISCORD_INFO_CHANNEL_ID) || await guild.channels.fetch(DISCORD_INFO_CHANNEL_ID).catch(()=>null);
    if (!ch) return it.reply({ content: "❌ Info kanál nenalezen.", ephemeral: true });

    const e = pink()
      .setTitle("📜 Pravidla serveru editorfarcik.eu")
      .setDescription([
        "Vítej v **editorfarcik.eu**! Prosím všechny o dodržování pravidel. *Neznalost neomlouvá!*",
        "",
        "I. 🚫 **Žádný spam/flood**",
        "II. 👑 **Žádné urážky/rasismus/toxic**",
        "III. 📢 **Zákaz reklamy**",
        "IV. 🛡 **Respektuj moderátory**",
        "V. ✅ **Vhodný obsah (bez NSFW/virů)**",
        "VI. 🔒 **Zákaz podvodů**",
        "VII. 📏 **Dodržuj pravidla Discordu**",
      ].join("\n"))
      .setFooter({ text: "editorfarcik.eu | Pravidla serveru" });

    await ch.send({ embeds: [e] });
    return it.reply({ content: "✅ Odesláno.", ephemeral: true });
  }

  // ----- /report (vidí všichni)
  if (it.commandName === "report") {
    const user = it.options.getUser("uživatel", true);
    const reason = it.options.getString("důvod", true);
    const emb = pink()
      .setTitle("🚨 Report")
      .setDescription(`**Nahlásil:** ${it.user}\n**Nahlášený:** ${user}\n**Důvod:** ${reason}\n**Čas:** ${time(Math.floor(Date.now()/1000))}`)
      .setFooter({ text: "editorfarcik.eu | Moderace systému" });
    await logEmbed(it.guild, emb);
    return it.reply({ content: "✅ Díky, nahlášení jsme přijali.", ephemeral: true });
  }

  // ----- role-gated odtud dál
  if (["ban","tempban","kick","mute","tempmute","warn","ticket","giveaway"].includes(it.commandName)) {
    if (!needSupport()) return;
  }

  if (it.commandName === "warn") {
    const user = it.options.getUser("uživatel", true);
    const reason = it.options.getString("důvod", true);

    // DM
    try {
      const dm = pink()
        .setTitle("⚠️ Varování")
        .setDescription(`Byl jsi varován na serveru **editorfarcik.eu**.\n**Důvod:** ${reason}`)
        .setFooter({ text: "editorfarcik.eu | Podpora varování" });
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("open_support_from_warn").setStyle(ButtonStyle.Primary).setLabel("Kontaktovat podporu")
      );
      const u = await client.users.fetch(user.id);
      await u.send({ embeds: [dm], components: [row] }).catch(()=>{});
    } catch {}

    // Log
    const emb = pink()
      .setTitle("⚠️ Varování uděleno")
      .setDescription(`**Moderátor:** ${it.user}\n**Uživatel:** ${user}\n**Důvod:** ${reason}`)
      .setFooter({ text: "editorfarcik.eu | Moderace systému" });
    await logEmbed(it.guild, emb);
    return it.reply({ content: "✅ Upozornění odesláno a zalogováno.", ephemeral: true });
  }

  if (it.commandName === "ban") {
    const user = it.options.getUser("uživatel", true);
    const reason = it.options.getString("důvod") || "Neuvedeno";
    const member = await it.guild.members.fetch(user.id).catch(()=>null);
    if (!member) return it.reply({ content: "❌ Uživatel není na serveru.", ephemeral: true });
    await member.ban({ reason }).catch(e=>it.reply({ content:`❌ Nepovedlo se: ${e?.message||e}`, ephemeral:true}));
    const emb = pink().setTitle("🔨 Ban").setDescription(`**Moderátor:** ${it.user}\n**Uživatel:** ${user}\n**Důvod:** ${reason}`).setFooter({ text:"editorfarcik.eu | Moderace systému" });
    await logEmbed(it.guild, emb);
    return it.reply({ content: "✅ Zabanován.", ephemeral: true });
  }

  if (it.commandName === "tempban") {
    const user = it.options.getUser("uživatel", true);
    const durStr = it.options.getString("doba", true);
    const reason = it.options.getString("důvod") || "Neuvedeno";
    const ms = parseDuration(durStr);
    if (!ms) return it.reply({ content: "❌ Špatný formát doby. Použij např. `30m`, `2h`, `1d`.", ephemeral: true });

    const member = await it.guild.members.fetch(user.id).catch(()=>null);
    if (!member) return it.reply({ content: "❌ Uživatel není na serveru.", ephemeral: true });
    await member.ban({ reason }).catch(e=>it.reply({ content:`❌ Nepovedlo se: ${e?.message||e}`, ephemeral:true}));

    setTimeout(async () => {
      await it.guild.members.unban(user.id, "Vypršel tempban").catch(()=>{});
    }, ms);

    const emb = pink().setTitle("⏳ Tempban")
      .setDescription(`**Moderátor:** ${it.user}\n**Uživatel:** ${user}\n**Doba:** ${fmtMs(ms)}\n**Důvod:** ${reason}`)
      .setFooter({ text:"editorfarcik.eu | Moderace systému" });
    await logEmbed(it.guild, emb);
    return it.reply({ content: "✅ Dočasný ban udělen.", ephemeral: true });
  }

  if (it.commandName === "kick") {
    const user = it.options.getUser("uživatel", true);
    const reason = it.options.getString("důvod") || "Neuvedeno";
    const member = await it.guild.members.fetch(user.id).catch(()=>null);
    if (!member) return it.reply({ content: "❌ Uživatel není na serveru.", ephemeral: true });
    await member.kick(reason).catch(e=>it.reply({ content:`❌ Nepovedlo se: ${e?.message||e}`, ephemeral:true}));
    const emb = pink().setTitle("🥾 Kick").setDescription(`**Moderátor:** ${it.user}\n**Uživatel:** ${user}\n**Důvod:** ${reason}`).setFooter({ text:"editorfarcik.eu | Moderace systému" });
    await logEmbed(it.guild, emb);
    return it.reply({ content: "✅ Vyhozen.", ephemeral: true });
  }

  if (it.commandName === "mute" || it.commandName === "tempmute") {
    const user = it.options.getUser("uživatel", true);
    const durStr = it.options.getString("doba", true);
    const reason = it.options.getString("důvod") || "Neuvedeno";
    const ms = parseDuration(durStr);
    if (!ms) return it.reply({ content: "❌ Špatný formát doby. `30m`, `2h`, `1d`…", ephemeral: true });

    const member = await it.guild.members.fetch(user.id).catch(()=>null);
    if (!member) return it.reply({ content: "❌ Uživatel není na serveru.", ephemeral: true });

    await member.timeout(ms, reason).catch(e=>it.reply({ content:`❌ Nepovedlo se: ${e?.message||e}`, ephemeral:true}));

    const emb = pink().setTitle("🔇 Timeout")
      .setDescription(`**Moderátor:** ${it.user}\n**Uživatel:** ${user}\n**Doba:** ${fmtMs(ms)}\n**Důvod:** ${reason}`)
      .setFooter({ text:"editorfarcik.eu | Moderace systému" });
    await logEmbed(it.guild, emb);
    return it.reply({ content: "✅ Timeout nastaven.", ephemeral: true });
  }

  if (it.commandName === "ticket" && it.options.getSubcommand() === "create") {
    // jen support role
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

  if (it.commandName === "giveaway" && it.options.getSubcommand() === "create") {
    // otevři modal
    const modal = new ModalBuilder().setCustomId("gw_create_modal").setTitle("🎉 Vytvořit giveaway");
    const prize = new TextInputBuilder().setCustomId("gw_prize").setLabel("Co se vyhrává?").setRequired(true).setStyle(TextInputStyle.Short);
    const winners = new TextInputBuilder().setCustomId("gw_winners").setLabel("Počet výherců").setRequired(true).setStyle(TextInputStyle.Short).setPlaceholder("např. 1");
    const duration = new TextInputBuilder().setCustomId("gw_duration").setLabel("Doba trvání").setRequired(true).setStyle(TextInputStyle.Short).setPlaceholder("např. 1h / 30m / 45s");
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
  const ms = parseDuration(durStr);
  if (!ms) return it.reply({ content: "❌ Špatný formát doby. Použij `30m`, `2h`, `1d`…", ephemeral: true });

  const ends = Date.now() + ms;
  const joinBtn = new ButtonBuilder().setCustomId("gw_join").setLabel("🎉 Přihlásit se").setStyle(ButtonStyle.Success);
  const e = pink()
    .setTitle("🎉 Giveaway")
    .setDescription([
      `**Cena:** ${prize}`,
      `**Počet výherců:** ${winnersCount}`,
      `**Končí:** ${time(Math.floor(ends/1000), "R")}`,
      `\nRole s větší šancí: ${BONUS_ROLES.map(roleMention).join(", ")} (2×)`,
    ].join("\n"))
    .setFooter({ text: "editorfarcik.eu | Moderace systému" });

  const msg = await it.channel.send({ embeds: [e], components: [new ActionRowBuilder().addComponents(joinBtn)] });
  runningGiveaways.set(msg.id, { entrants: new Set(), endsAt: ends, winners: winnersCount, prize, channelId: msg.channel.id });

  setTimeout(async () => {
    const gw = runningGiveaways.get(msg.id);
    if (!gw) return;
    // posbíráme členy
    const channel = await client.channels.fetch(gw.channelId).catch(()=>null);
    if (!channel) return;
    const entries = [...gw.entrants];

    if (entries.length === 0) {
      await msg.reply({ embeds: [pink().setTitle("🎉 Giveaway").setDescription("Nikdo se nepřihlásil.").setFooter({ text:"editorfarcik.eu | Moderace systému" })] });
      runningGiveaways.delete(msg.id);
      return;
    }

    // vážený výběr
    const guild = await client.guilds.fetch(GUILD_ID);
    const weighted = [];
    for (const id of entries) {
      const m = await guild.members.fetch(id).catch(()=>null);
      if (!m) continue;
      weighted.push(id);
      if (hasSomeRole(m, BONUS_ROLES)) weighted.push(id); // 2x šance
    }

    const winners = [];
    while (winners.length < gw.winners && weighted.length) {
      const pick = weighted[Math.floor(Math.random()*weighted.length)];
      if (!winners.includes(pick)) winners.push(pick);
    }

    const wText = winners.length ? winners.map(userMention).join(", ") : "nikdo";
    await msg.reply({ embeds: [pink().setTitle("🎉 Výsledky").setDescription(`**Výhra:** ${gw.prize}\n**Výherci:** ${wText}`).setFooter({ text:"editorfarcik.eu | Moderace systému" })] });
    runningGiveaways.delete(msg.id);
  }, ms);

  return it.reply({ content: "✅ Giveaway založena.", ephemeral: true });
});

// klik na „Přihlásit se“
client.on("interactionCreate", async (it) => {
  if (!it.isButton() || it.customId !== "gw_join") return;
  const gw = runningGiveaways.get(it.message.id);
  if (!gw) return it.reply({ content: "❌ Tahle giveaway už neexistuje.", ephemeral: true });
  gw.entrants.add(it.user.id);
  return it.reply({ content: "✅ Jsi v osudí!", ephemeral: true });
});

// ====== START ======
client.login(TOKEN);
