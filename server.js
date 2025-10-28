// ====== ZÁKLAD ======
require("dotenv").config();
const express = require("express");
const app = express();

app.get("/", (req, res) => {
  res.send("✅ editorfarcik.eu bot běží 24/7");
});

app.listen(3000, () => console.log("🌐 Webserver běží na portu 3000"));

const {
  Client,
  GatewayIntentBits,
  Partials,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  PermissionsBitField,
} = require("discord.js");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages
  ],
  partials: [Partials.Channel, Partials.Message, Partials.GuildMember],
});

// ====== KONSTANTY ======
const GUILD_ID = "1429032922446430422";
const TICKET_CATEGORY_ID = "1429032923469713510";
const TICKET_PANEL_CHANNEL_ID = "1429485456667443220";
const WARN_CATEGORY_ID = "1430626033241030717";
const WARN_SUPPORT_CHANNEL_ID = "1430626172110114836";
const SUPPORT_ROLES = ["1429036050260426855", "1430295218074419211"];
const MODLOG_CHANNEL_ID = "1430647278741229840";

// ====== STAV PRO „Převzít“ ======
const activeTickets = new Map();

// ====== READY ======
client.once("ready", () => {
  console.log(`✅ ${client.user.tag} je online`);
  client.user.setActivity("🎬 editorfarcik.eu", { type: 3 });
});

// ====== !ping ======
client.on("messageCreate", async (msg) => {
  try {
    if (msg.author.bot) return;
    if (msg.content.toLowerCase() === "!ping") {
      await msg.reply("🏓 Pong!");
    }
  } catch { }
});

// ====== !ticket-panel ======
client.on("messageCreate", async (msg) => {
  try {
    if (msg.author.bot) return;
    if (msg.content.toLowerCase() !== "!ticket-panel") return;

    if (!msg.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return msg.reply("❌ Nemáš oprávnění pro vytvoření ticket panelu.");
    }

    const panelChannel = msg.guild.channels.cache.get(TICKET_PANEL_CHANNEL_ID);
    if (!panelChannel) return msg.reply("❌ Kanál pro panel nebyl nalezen.");

    const embed = new EmbedBuilder()
      .setColor("#ff4f8b")
      .setTitle("🎟️ Objednávky")
      .setDescription("Vyber typ ticketu.\n\n*⚠️ Tento systém je určen pro objednávky a dotazy ohledně editů.*")
      .setFooter({ text: "editorfarcik.eu | Podpora ticketu" });

    const menu = new StringSelectMenuBuilder()
      .setCustomId("ticket_category")
      .setPlaceholder("🧾 Vyber typ ticketu")
      .addOptions(
        { label: "🎬 Objednávka editu", description: "Chci objednat edit.", value: "order" },
        { label: "🤝 Spolupráce", description: "Mám zájem o spolupráci.", value: "collab" },
        { label: "💬 Dotaz / poradenství", description: "Potřebuji poradit.", value: "question" },
      );

    const row = new ActionRowBuilder().addComponents(menu);

    await panelChannel.send({ embeds: [embed], components: [row] });
    await msg.reply("✅ Ticket panel byl odeslán.");
  } catch (err) {
    console.error("ticket-panel error:", err);
  }
});

// ====== SELECT → MODAL ======
client.on("interactionCreate", async (interaction) => {
  try {
    if (!interaction.isStringSelectMenu()) return;
    if (interaction.customId !== "ticket_category") return;

    const type = interaction.values[0];

    const modal = new ModalBuilder()
      .setCustomId(`ticket_form_${type}`)
      .setTitle("🎫 Nový ticket");

    const name = new TextInputBuilder()
      .setCustomId("name")
      .setLabel("Tvoje jméno nebo přezdívka")
      .setStyle(TextInputStyle.Short)
      .setPlaceholder("Např. Steve / Alex")
      .setRequired(true);

    const contact = new TextInputBuilder()
      .setCustomId("contact")
      .setLabel("Kontakt")
      .setStyle(TextInputStyle.Short)
      .setPlaceholder("Např. Discord, Instagram, e-mail")
      .setRequired(true);

    const details = new TextInputBuilder()
      .setCustomId("details")
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true);

    if (type === "order") {
      details.setLabel("Popiš, co chceš upravit");
      details.setPlaceholder("Např. chci cinematic edit s hudbou a efekty…");
    } else if (type === "collab") {
      details.setLabel("O jakou spolupráci máš zájem?");
      details.setPlaceholder("Např. dlouhodobá spolupráce na editech…");
    } else {
      details.setLabel("Popiš, o co jde");
      details.setPlaceholder("S čím potřebuješ poradit?");
    }

    modal.addComponents(
      new ActionRowBuilder().addComponents(name),
      new ActionRowBuilder().addComponents(details),
      new ActionRowBuilder().addComponents(contact),
    );

    await interaction.showModal(modal);
  } catch (err) {
    console.error("select->modal error:", err);
    if (!interaction.replied) {
      await interaction.reply({ content: "❌ Něco se pokazilo. Zkus to znovu.", flags: 64 });
    }
  }
});

// ====== MODAL SUBMIT → VYTVOŘENÍ TICKETU ======
client.on("interactionCreate", async (interaction) => {
  try {
    if (!interaction.isModalSubmit()) return;
    if (!interaction.customId.startsWith("ticket_form_")) return;

    const type = interaction.customId.replace("ticket_form_", "");
    const guild = client.guilds.cache.get(GUILD_ID) || await client.guilds.fetch(GUILD_ID);
    const category = guild.channels.cache.get(TICKET_CATEGORY_ID) || await guild.channels.fetch(TICKET_CATEGORY_ID);

    if (!category) {
      return interaction.reply({ content: "❌ Kategorie pro tickety nebyla nalezena.", flags: 64 });
    }

    const name = interaction.fields.getTextInputValue("name");
    const details = interaction.fields.getTextInputValue("details");
    const contact = interaction.fields.getTextInputValue("contact");

    const typeMap = {
      order: { text: "Objednávka editu", icon: "🎬", slug: "objednavka" },
      collab: { text: "Spolupráce", icon: "🤝", slug: "spoluprace" },
      question: { text: "Dotaz / poradenství", icon: "💬", slug: "dotaz" },
    };
    const t = typeMap[type] || { text: "Ticket", icon: "🎟️", slug: "ticket" };

    const chan = await guild.channels.create({
      name: `${t.icon}│${t.slug}-${interaction.user.username}`.toLowerCase(),
      type: ChannelType.GuildText,
      parent: category.id,
      permissionOverwrites: [
        { id: guild.roles.everyone, deny: [PermissionsBitField.Flags.ViewChannel] },
        { id: interaction.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
        { id: client.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
        ...SUPPORT_ROLES.map(rid => ({
          id: rid,
          allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages],
        })),
      ],
    });

    const embed = new EmbedBuilder()
      .setColor("#ff4f8b")
      .setTitle("🎟️ Nový ticket")
      .setDescription(`**Kategorie:** ${t.text}\n**Uživatel:** ${interaction.user}\n\n> **Jméno:** ${name}\n> **Kontakt:** ${contact}\n> **Detail:** ${details}`)
      .setFooter({ text: "editorfarcik.eu | Podpora ticketu" });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("take_ticket").setLabel("✅ Převzít").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId("close_ticket").setLabel("🔒 Zavřít ticket").setStyle(ButtonStyle.Danger),
    );

    await chan.send({ content: `<@${interaction.user.id}>`, embeds: [embed], components: [row] });
    await interaction.reply({ content: `✅ Ticket vytvořen: ${chan}`, flags: 64 });
  } catch (err) {
    console.error("modal->create error:", err);
    if (!interaction.replied) {
      await interaction.reply({ content: "❌ Nepodařilo se vytvořit ticket.", flags: 64 });
    }
  }
});

// ====== OVLÁDÁNÍ TICKETŮ ======
client.on("interactionCreate", async (interaction) => {
  try {
    if (!interaction.isButton()) return;

    if (interaction.customId === "take_ticket") {
      const can = SUPPORT_ROLES.some(r => interaction.member?.roles?.cache?.has(r));
      if (!can) return interaction.reply({ content: "❌ Nemáš oprávnění převzít tento ticket.", flags: 64 });

      const current = activeTickets.get(interaction.channel.id);
      if (current === interaction.user.id) {
        activeTickets.delete(interaction.channel.id);
        return interaction.reply({ content: `🚫 ${interaction.user} se vzdal ticketu.`, flags: 64 });
      } else {
        activeTickets.set(interaction.channel.id, interaction.user.id);
        return interaction.reply({ content: `✅ Ticket převzal: ${interaction.user}`, flags: 64 });
      }
    }

    if (interaction.customId === "close_ticket") {
      await interaction.reply({ content: "🔒 Ticket se uzavře za 5 sekund…", flags: 64 });
      setTimeout(() => interaction.channel.delete().catch(() => {}), 5000);
    }
  } catch (err) {
    console.error("buttons error:", err);
    if (!interaction.replied) {
      await interaction.reply({ content: "❌ Chyba při zpracování tlačítka.", flags: 64 });
    }
  }
});

// ====== LOGIN ======
client.login(process.env.TOKEN);
