import 'dotenv/config';
import {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  EmbedBuilder,
  PermissionsBitField,
  ChannelType
} from 'discord.js';
import { ticketCommand, buildTicketEmbed } from './commands.js';

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;
const guildId = process.env.EMS_GUILD_ID;
const ticketRoleId = process.env.EMS_TICKET_ROLE_ID;
const ticketCategoryId = process.env.EMS_TICKET_CATEGORY_ID;
const ticketLogChannelId = process.env.EMS_TICKET_LOG_CHANNEL_ID;
const welcomeChannelId = process.env.EMS_WELCOME_CHANNEL_ID;

const missing = [];
if (!token) missing.push('DISCORD_TOKEN');
if (!clientId) missing.push('DISCORD_CLIENT_ID');
if (!guildId) missing.push('EMS_GUILD_ID');
if (!ticketRoleId) missing.push('EMS_TICKET_ROLE_ID');
if (!welcomeChannelId) missing.push('EMS_WELCOME_CHANNEL_ID');

if (missing.length) {
  console.error('Variabili mancanti:', missing.join(', '));
  process.exit(1);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers]
});

client.once('ready', async () => {
  try {
    const rest = new REST({ version: '10' }).setToken(token);
    await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
      body: [ticketCommand.toJSON()]
    });
    console.log(`Bot pronto come ${client.user.tag}`);
  } catch (error) {
    console.error('Errore registrazione comandi:', error);
  }
});

function memberHasTicketRole(member) {
  return !!member.roles?.cache.has(ticketRoleId);
}

client.on('interactionCreate', async (interaction) => {
  try {
    if (interaction.isChatInputCommand() && interaction.commandName === 'ems-ticket') {
      const embed = new EmbedBuilder()
        .setTitle('🎫 Sistema Ticket EMS')
        .setDescription('Scegli la categoria del ticket per aprire un canale privato accessibile solo al ruolo EMS e a te.')
        .setColor(0x00AAFF)
        .addFields(
          { name: 'Categorie', value: 'Alto, Comando, Direzione, Segnalazione, Persona, Info' },
          { name: 'Come usare', value: 'Premi il pulsante, seleziona la categoria e il ticket verrà creato automaticamente.' }
        )
        .setTimestamp();

      const button = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('open_ticket')
          .setLabel('Apri ticket EMS')
          .setStyle(ButtonStyle.Primary)
      );

      await interaction.reply({ embeds: [embed], components: [button], ephemeral: true });
      return;
    }

    if (interaction.isButton()) {
      if (interaction.customId === 'open_ticket') {
        const menu = new StringSelectMenuBuilder()
          .setCustomId('ticket_category_select')
          .setPlaceholder('Seleziona la categoria del ticket')
          .addOptions([
            { label: 'Alto', value: 'alto', description: 'Richiesta urgente / prioritaria' },
            { label: 'Comando', value: 'comando', description: 'Richiesta al comando EMS' },
            { label: 'Direzione', value: 'direzione', description: 'Domanda o ordine dalla direzione' },
            { label: 'Segnalazione', value: 'segnalazione', description: 'Segnala un problema o un incidente' },
            { label: 'Persona', value: 'persona', description: 'Richiesta su un membro specifico' },
            { label: 'Info', value: 'info', description: 'Domande generali e informazioni' }
          ]);

        const row = new ActionRowBuilder().addComponents(menu);
        await interaction.update({ content: 'Seleziona qui la categoria del tuo ticket.', components: [row], embeds: [] });
        return;
      }

      if (interaction.customId === 'claim_ticket' || interaction.customId === 'close_ticket') {
        if (!interaction.member || !memberHasTicketRole(interaction.member)) {
          await interaction.reply({ content: 'Solo il ruolo EMS può usare questo pulsante.', ephemeral: true });
          return;
        }

        const channel = interaction.channel;
        if (!channel?.isTextBased() || !channel.topic?.includes('Ticket EMS creato da')) {
          await interaction.reply({ content: "Questo pulsante può essere usato solo all'interno di un ticket.", ephemeral: true });
          return;
        }

        if (interaction.customId === 'claim_ticket') {
          await interaction.reply({ content: `Ticket claimato da ${interaction.user.tag}.`, ephemeral: true });
          await channel.send({ content: `🔰 ${interaction.user.tag} ha claimato questo ticket.` });
          return;
        }

        const modal = new ModalBuilder()
          .setCustomId('close_ticket_modal')
          .setTitle('Chiudi ticket EMS')
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('close_reason')
                .setLabel('Motivazione della chiusura')
                .setStyle(TextInputStyle.Paragraph)
                .setPlaceholder('Scrivi perché chiudi il ticket...')
                .setRequired(true)
            )
          );

        await interaction.showModal(modal);
        return;
      }
    }

    if (interaction.isStringSelectMenu() && interaction.customId === 'ticket_category_select') {
      const category = interaction.values[0];
      const categoryName = {
        alto: 'Alto',
        comando: 'Comando',
        direzione: 'Direzione',
        segnalazione: 'Segnalazione',
        persona: 'Persona',
        info: 'Info'
      }[category] ?? 'Ticket';

      const guild = interaction.guild;
      if (!guild) {
        await interaction.reply({ content: 'Errore: server non trovato.', ephemeral: true });
        return;
      }

      const existingTicket = guild.channels.cache.find(
        (channel) =>
          channel.type === ChannelType.GuildText &&
          channel.topic?.includes(`(${interaction.user.id})`)
      );

      if (existingTicket) {
        await interaction.reply({ content: `Hai già un ticket aperto: ${existingTicket}`, ephemeral: true });
        return;
      }

      const typeCategoryName = `Ticket - ${categoryName}`;
      let typeCategory = guild.channels.cache.find(
        (channel) => channel.type === ChannelType.GuildCategory && channel.name === typeCategoryName
      );

      if (!typeCategory) {
        typeCategory = await guild.channels.create({
          name: typeCategoryName,
          type: ChannelType.GuildCategory
        });
      }

      const safeName = `ticket-${category}-${interaction.user.username}`
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '-')
        .replace(/-+/g, '-')
        .slice(0, 90);

      const channel = await guild.channels.create({
        name: safeName,
        type: ChannelType.GuildText,
        parent: typeCategory.id,
        topic: `Ticket EMS creato da ${interaction.user.tag} (${interaction.user.id})`,
        permissionOverwrites: [
          {
            id: guild.roles.everyone,
            deny: [PermissionsBitField.Flags.ViewChannel]
          },
          {
            id: interaction.user.id,
            allow: [
              PermissionsBitField.Flags.ViewChannel,
              PermissionsBitField.Flags.SendMessages,
              PermissionsBitField.Flags.ReadMessageHistory
            ]
          },
          {
            id: ticketRoleId,
            allow: [
              PermissionsBitField.Flags.ViewChannel,
              PermissionsBitField.Flags.SendMessages,
              PermissionsBitField.Flags.ReadMessageHistory
            ]
          }
        ]
      });

      const actionRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('claim_ticket')
          .setLabel('Claim')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId('close_ticket')
          .setLabel('Chiudi ticket')
          .setStyle(ButtonStyle.Danger)
      );

      const ticketEmbed = buildTicketEmbed(interaction.user, categoryName, ticketRoleId);
      await channel.send({
        content: `<@${interaction.user.id}>`,
        embeds: [ticketEmbed],
        components: [actionRow]
      });

      if (ticketLogChannelId) {
        const logChannel = guild.channels.cache.get(ticketLogChannelId);
        if (logChannel?.isTextBased()) {
          await logChannel.send({
            embeds: [
              new EmbedBuilder()
                .setTitle('📬 Nuovo Ticket EMS')
                .setDescription(`Ticket creato da ${interaction.user.tag}`)
                .addFields(
                  { name: 'Categoria', value: categoryName, inline: true },
                  { name: 'Utente', value: interaction.user.tag, inline: true },
                  { name: 'Canale', value: `<#${channel.id}>`, inline: true }
                )
                .setTimestamp()
            ]
          });
        }
      }

      await interaction.reply({ content: `Ticket creato: ${channel}`, ephemeral: true });
      return;
    }

    if (interaction.isModalSubmit() && interaction.customId === 'close_ticket_modal') {
      const reason = interaction.fields.getTextInputValue('close_reason');
      const channel = interaction.channel;
      if (!channel?.isTextBased()) {
        await interaction.reply({ content: 'Errore: impossibile chiudere il ticket.', ephemeral: true });
        return;
      }

      await interaction.reply({ content: 'Ticket chiuso.', ephemeral: true });

      const closeEmbed = new EmbedBuilder()
        .setTitle('✅ Ticket chiuso')
        .setDescription(`Questo ticket è stato chiuso da ${interaction.user.tag}.`)
        .addFields(
          { name: 'Motivazione', value: reason },
          { name: 'Canale', value: channel.name }
        )
        .setColor(0xFF0000)
        .setTimestamp();

      await channel.send({ embeds: [closeEmbed] });

      const ownerMatch = channel.topic?.match(/\((\d{17,})\)/);
      if (ownerMatch) {
        await channel.permissionOverwrites.edit(ownerMatch[1], {
          SendMessages: false,
          ViewChannel: true,
          ReadMessageHistory: true
        });
      }
      await channel.permissionOverwrites.edit(ticketRoleId, {
        SendMessages: false,
        ViewChannel: true,
        ReadMessageHistory: true
      });

      if (!channel.name.startsWith('closed-')) {
        await channel.setName(`closed-${channel.name}`);
      }
      return;
    }
  } catch (error) {
    console.error('Errore gestendo interazione:', error);
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content: 'Si è verificato un errore interno.', ephemeral: true });
    } else {
      await interaction.reply({ content: 'Si è verificato un errore interno.', ephemeral: true });
    }
  }
});

client.on('guildMemberAdd', async (member) => {
  const channel = await client.channels.fetch(welcomeChannelId).catch(() => null);
  if (!channel?.isTextBased()) return;
  const count = member.guild.memberCount;
  await channel.send(`${member.user} benvenuto nell'EMS, sei il membro numero ${count}.`);
});

client.on('guildMemberRemove', async (member) => {
  const channel = await client.channels.fetch(welcomeChannelId).catch(() => null);
  if (!channel?.isTextBased()) return;
  const count = member.guild.memberCount;
  await channel.send(`${member.user.tag} ci ha abbandonati adesso siamo in ${count} membri.`);
});

client.login(token);
