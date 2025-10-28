require("dotenv").config();
const { REST, Routes, SlashCommandBuilder } = require("discord.js");

const CLIENT_ID = process.env.CLIENT_ID; // ID tvé aplikace (bota)
const GUILD_ID = "1429032922446430422"; // tvůj server ID

const commands = [
  // /warn
  new SlashCommandBuilder()
    .setName("warn")
    .setDescription("⚠️ Varování uživatele")
    .addUserOption(opt =>
      opt.setName("uživatel")
        .setDescription("Uživatel, který bude varován")
        .setRequired(true))
    .addStringOption(opt =>
      opt.setName("důvod")
        .setDescription("Důvod varování")
        .setRequired(true)),

  // /report
  new SlashCommandBuilder()
    .setName("report")
    .setDescription("🚨 Nahlášení uživatele (vidí admin tým)")
    .addUserOption(opt =>
      opt.setName("uživatel")
        .setDescription("Uživatel, kterého chceš nahlásit")
        .setRequired(true))
    .addStringOption(opt =>
      opt.setName("důvod")
        .setDescription("Důvod nahlášení")
        .setRequired(true)),

  // /giveaway create
  new SlashCommandBuilder()
    .setName("giveaway")
    .setDescription("🎉 Giveaway příkazy")
    .addSubcommand(sub =>
      sub.setName("create")
        .setDescription("Spustí novou giveaway (pouze pro povolené role)")
        .addStringOption(opt =>
          opt.setName("doba")
            .setDescription("Doba trvání (např. 1d 2h 30m)")
            .setRequired(true))
        .addStringOption(opt =>
          opt.setName("výhra")
            .setDescription("Co se vyhrává?")
            .setRequired(true))
        .addIntegerOption(opt =>
          opt.setName("výherci")
            .setDescription("Počet výherců")
            .setRequired(true)))),

  // /pravidla
  new SlashCommandBuilder()
    .setName("pravidla")
    .setDescription("📜 Odešle embed s pravidly do určeného kanálu (pouze staff)"),
].map(cmd => cmd.toJSON());

const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

(async () => {
  try {
    console.log("🔄 Registruji slash příkazy...");
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
    console.log("✅ Slash příkazy byly úspěšně registrovány!");
  } catch (err) {
    console.error("❌ Chyba při registraci příkazů:", err);
  }
})();
