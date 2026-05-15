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
  AttachmentBuilder,
  PermissionsBitField,
  ChannelType,
  MessageFlags
} from 'discord.js';
import { ticketCommand, ticketAddCommand, buildTicketEmbed } from './commands.js';

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;
const guildId = process.env.EMS_GUILD_ID;
const ticketRoleId = process.env.EMS_TICKET_ROLE_ID;
const ticketCategoryId = process.env.EMS_TICKET_CATEGORY_ID;
const ticketLogChannelId = process.env.EMS_TICKET_LOG_CHANNEL_ID;
const welcomeChannelId = process.env.EMS_WELCOME_CHANNEL_ID;
const ticketPanelChannelId = process.env.EMS_TICKET_PANEL_CHANNEL_ID;

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

client.once('clientReady', async () => {
  try {
    const rest = new REST({ version: '10' }).setToken(token);
    await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
      body: [ticketCommand.toJSON(), ticketAddCommand.toJSON()]
    });
    console.log(`Bot pronto come ${client.user.tag}`);

    // Invia il pannello ticket al canale specificato
    if (ticketPanelChannelId) {
      const guild = client.guilds.cache.get(guildId);
      if (guild) {
        const panelChannel = guild.channels.cache.get(ticketPanelChannelId);
        if (panelChannel?.isTextBased()) {
          const embed = new EmbedBuilder()
            .setTitle('🎫 Sistema Ticket EMS')
            .setDescription('Premi il pulsante corrispondente per aprire un ticket. Segui le istruzioni quando il canale verrà creato.')
            .setColor(0x00AAFF)
            .setTimestamp();

          try {
            embed.setImage(client.user.displayAvatarURL({ size: 1024 }));
          } catch (e) {}

          const row1 = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId('ticket_category_info')
              .setLabel('Info')
              .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
              .setCustomId('ticket_category_segnalazione')
              .setLabel('Segnalazioni')
              .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
              .setCustomId('ticket_category_alto')
              .setLabel('Alto')
              .setStyle(ButtonStyle.Danger)
          );

          const row2 = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId('ticket_category_comando')
              .setLabel('Comando')
              .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
              .setCustomId('ticket_category_direzione')
              .setLabel('Direzione')
              .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
              .setCustomId('ticket_category_persona')
              .setLabel('Persona')
              .setStyle(ButtonStyle.Primary)
          );

          await panelChannel.send({ embeds: [embed], components: [row1, row2] });
          console.log('Pannello ticket inviato al canale:', panelChannel.name);
        }
      }
    }
  } catch (error) {
    console.error('Errore registrazione comandi o invio pannello:', error);
  }
});

function memberHasTicketRole(member) {
  return !!member.roles?.cache.has(ticketRoleId);
}

async function createHtmlTranscript(channel) {
  const messages = await channel.messages.fetch({ limit: 100 });
  const sorted = Array.from(messages.values()).sort((a, b) => a.createdTimestamp - b.createdTimestamp);
  let rows = '';
  for (const m of sorted) {
    const time = new Date(m.createdTimestamp).toLocaleString();
    const author = `${m.author.tag}`;
    const content = (m.content || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    let attachments = '';
    if (m.attachments && m.attachments.size) {
      attachments = Array.from(m.attachments.values()).map(a => `<a href="${a.url}">${a.name || a.id}</a>`).join(' ');
    }
    rows += `<div style="margin:8px 0;padding:8px;border-bottom:1px solid #ddd;"><strong>${author}</strong> <span style="color:#888;font-size:0.9em">${time}</span><div style="margin-top:6px">${content}</div><div>${attachments}</div></div>`;
  }

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Transcript ${channel.name}</title></head><body><h2>Transcript: ${channel.name}</h2>${rows}</body></html>`;
  const buffer = Buffer.from(html, 'utf8');
  return new AttachmentBuilder(buffer, { name: `${channel.name}-transcript.html` });
}

client.on('interactionCreate', async (interaction) => {
  try {
    if (interaction.isButton()) {
      // Defer la risposta per evitare timeout
      if (!interaction.deferred && !interaction.replied) {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
      }

      if (interaction.customId.startsWith('ticket_category_')) {
        const category = interaction.customId.replace('ticket_category_', '');
        const categoryName = {
          alto: 'Alto',
          comando: 'Comando',
          direzione: 'Direzione',
          segnalazione: 'Segnalazione',
          persona: 'Persona',
          info: 'Info'
        }[category] ?? 'Ticket';

        console.log(`📝 Inizio creazione ticket categoria: ${categoryName}`);

        const guild = interaction.guild;
        if (!guild) {
          console.error('❌ Errore: Guild non trovata');
          await interaction.editReply({ content: 'Errore: server non trovato.' });
          return;
        }

        console.log(`✅ Guild trovata: ${guild.name}`);

        const existingTicket = guild.channels.cache.find(
          (channel) =>
            channel.type === ChannelType.GuildText &&
            channel.topic?.includes(`(${interaction.user.id})`)
        );

        if (existingTicket) {
          console.log(`⚠️ Utente ha già un ticket: ${existingTicket.name}`);
          await interaction.editReply({ content: `Hai già un ticket aperto: ${existingTicket}` });
          return;
        }

        console.log(`✅ Nessun ticket esistente`);

        const typeCategoryName = `Ticket - ${categoryName}`;
        let typeCategory = guild.channels.cache.find(
          (channel) => channel.type === ChannelType.GuildCategory && channel.name === typeCategoryName
        );

        if (!typeCategory) {
          console.log(`📁 Creando categoria: ${typeCategoryName}`);
          typeCategory = await guild.channels.create({
            name: typeCategoryName,
            type: ChannelType.GuildCategory
          });
          console.log(`✅ Categoria creata: ${typeCategory.id}`);
        } else {
          console.log(`✅ Categoria trovata: ${typeCategory.name}`);
        }

        const safeName = `ticket-${category}-${interaction.user.username}`
          .toLowerCase()
          .replace(/[^a-z0-9-]/g, '-')
          .replace(/-+/g, '-')
          .slice(0, 90);

        console.log(`📝 Nome canale: ${safeName}`);
        console.log(`👥 Ruolo ticket: ${ticketRoleId}`);

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

        console.log(`✅ Canale creato: ${channel.id}`);

        const actionRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('claim_ticket')
            .setLabel('Reclama')
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId('add_person')
            .setLabel('Aggiungi persona')
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId('close_ticket')
            .setLabel('Chiudi')
            .setStyle(ButtonStyle.Danger)
        );

        const ticketEmbed = buildTicketEmbed(interaction.user, categoryName, ticketRoleId, client);
        await channel.send({
          content: `<@${interaction.user.id}>`,
          embeds: [ticketEmbed],
          components: [actionRow]
        });

        console.log(`✅ Messaggio inviato al canale`);

        if (ticketLogChannelId) {
          try {
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
              console.log(`✅ Log inviato al canale di log`);
            }
          } catch (logError) {
            console.warn(`⚠️ Errore nell'invio del log:`, logError.message);
          }
        }

        await interaction.editReply({ content: `✅ Ticket creato: ${channel}` });
        console.log(`✅ Ticket creato con successo`);
        return;
      }

      if (interaction.customId === 'claim_ticket' || interaction.customId === 'close_ticket' || interaction.customId === 'add_person') {
        if (!interaction.member || !memberHasTicketRole(interaction.member)) {
          console.warn(`⚠️ Utente ${interaction.user.tag} non ha il ruolo per reclamare/chiudere ticket`);
          await interaction.editReply({ content: 'Solo il ruolo EMS può usare questo pulsante.' });
          return;
        }

        const channel = interaction.channel;
        if (!channel?.isTextBased() || !channel.topic?.includes('Ticket EMS creato da')) {
          console.error(`❌ Canale non valido o non è un ticket`);
          await interaction.editReply({ content: "Questo pulsante può essere usato solo all'interno di un ticket." });
          return;
        }

        if (interaction.customId === 'claim_ticket') {
          console.log(`✅ Ticket claimato da ${interaction.user.tag}`);
          await interaction.editReply({ content: `Ticket claimato da ${interaction.user.tag}.` });
          await channel.send({ content: `🔰 ${interaction.user.tag} ha claimato questo ticket.` });
          return;
        }

        if (interaction.customId === 'add_person') {
          const modal = new ModalBuilder()
            .setCustomId('add_person_modal')
            .setTitle('Aggiungi persona al ticket')
            .addComponents(
              new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                  .setCustomId('add_user')
                  .setLabel('Inserisci @utente o ID')
                  .setStyle(TextInputStyle.Short)
                  .setPlaceholder('Esempio: @utente oppure 123456789012345678')
                  .setRequired(true)
              )
            );

          await interaction.showModal(modal);
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

    if (interaction.isModalSubmit() && (interaction.customId === 'close_ticket_modal' || interaction.customId === 'add_person_modal')) {
      // Defer la risposta per evitare timeout
      if (!interaction.deferred && !interaction.replied) {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
      }

      const channel = interaction.channel;
      if (interaction.customId === 'add_person_modal') {
        const userInput = interaction.fields.getTextInputValue('add_user');
        const idMatch = userInput.match(/(\d{17,19})/) || userInput.match(/<@!?(\d{17,19})>/);
        const id = idMatch ? idMatch[1] : null;
        if (!id) {
          await interaction.reply({ content: 'ID utente non valido.', flags: [MessageFlags.Ephemeral] });
          return;
        }
        try {
          await channel.permissionOverwrites.edit(id, {
            ViewChannel: true,
            SendMessages: true,
            ReadMessageHistory: true
          });
          await interaction.reply({ content: `Utente <@${id}> aggiunto al ticket.`, flags: [MessageFlags.Ephemeral] });
        } catch (e) {
          await interaction.reply({ content: `Errore aggiunta utente: ${e.message}`, flags: [MessageFlags.Ephemeral] });
        }
        return;
      }

      // close_ticket_modal
      const reason = interaction.fields.getTextInputValue('close_reason');
      if (!channel?.isTextBased()) {
        await interaction.editReply({ content: 'Errore: impossibile chiudere il ticket.' });
        return;
      }

      await interaction.editReply({ content: 'Ticket chiuso.' });

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

      const ownerMatch = channel.topic?.match(/\((\d{17,19})\)/);
      if (ownerMatch) {
        try {
          await channel.permissionOverwrites.edit(ownerMatch[1], {
            SendMessages: false,
            ViewChannel: true,
            ReadMessageHistory: true
          });
        } catch (e) {
          console.warn('Impossibile aggiornare permessi owner:', e.message);
        }
      }
      try {
        await channel.permissionOverwrites.edit(ticketRoleId, {
          SendMessages: false,
          ViewChannel: true,
          ReadMessageHistory: true
        });
      } catch (e) {}

      if (!channel.name.startsWith('closed-')) {
        await channel.setName(`closed-${channel.name}`);
      }

      // creare trascrizione e inviarla in privato
      try {
        const transcriptAttachment = await createHtmlTranscript(channel);
        const summaryEmbed = new EmbedBuilder()
          .setTitle(`Trascrizione ticket: ${channel.name}`)
          .setDescription(`Ticket chiuso da ${interaction.user.tag}`)
          .addFields({ name: 'Motivazione', value: reason })
          .setTimestamp();

        // invia DM al closer
        try {
          await interaction.user.send({ embeds: [summaryEmbed], files: [transcriptAttachment] }).catch(() => null);
        } catch (e) {}

        // invia DM al proprietario del ticket
        if (ownerMatch) {
          try {
            const owner = await client.users.fetch(ownerMatch[1]);
            await owner.send({ embeds: [summaryEmbed], files: [transcriptAttachment] }).catch(() => null);
          } catch (e) {}
        }

        // invia nel canale di log se configurato
        if (ticketLogChannelId) {
          try {
            const logChannel = await client.channels.fetch(ticketLogChannelId);
            if (logChannel?.isTextBased()) await logChannel.send({ embeds: [summaryEmbed], files: [transcriptAttachment] });
          } catch (e) {
            console.warn('Errore invio trascrizione al log:', e.message);
          }
        }
      } catch (e) {
        console.warn('Errore nella generazione della trascrizione:', e.message);
      }

      return;
    }

    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === 'ticket-add') {
        const user = interaction.options.getUser('user');
        const channel = interaction.channel;
        if (!channel?.isTextBased() || !channel.topic?.includes('Ticket EMS creato da')) {
          await interaction.reply({ content: 'Questo comando può essere usato solo dentro un ticket.', flags: [MessageFlags.Ephemeral] });
          return;
        }
        if (!interaction.member || !memberHasTicketRole(interaction.member)) {
          await interaction.reply({ content: 'Devi avere il ruolo EMS per usare questo comando.', flags: [MessageFlags.Ephemeral] });
          return;
        }
        try {
          await channel.permissionOverwrites.edit(user.id, {
            ViewChannel: true,
            SendMessages: true,
            ReadMessageHistory: true
          });
          await interaction.reply({ content: `Utente ${user.tag} aggiunto al ticket.`, flags: [MessageFlags.Ephemeral] });
        } catch (e) {
          await interaction.reply({ content: `Errore: ${e.message}`, flags: [MessageFlags.Ephemeral] });
        }
        return;
      }
    }
  } catch (error) {
    const errorMessage = error.message || 'Errore sconosciuto';
    const errorCode = error.code || 'NO_CODE';
    const errorName = error.name || 'Error';
    
    console.error('\n❌ ========== ERRORE INTERAZIONE ==========');
    console.error(`Nome: ${errorName}`);
    console.error(`Messaggio: ${errorMessage}`);
    console.error(`Codice: ${errorCode}`);
    console.error(`Stack:\n${error.stack}`);
    console.error('========================================\n');
    
    const errorEmbed = new EmbedBuilder()
      .setTitle('❌ Errore')
      .setDescription(errorMessage)
      .addFields(
        { name: 'Tipo Errore', value: `\`${errorName}\``, inline: true },
        { name: 'Codice', value: `\`${errorCode}\``, inline: true }
      )
      .setColor(0xFF0000)
      .setTimestamp();
    
    try {
      if (interaction.isRepliable()) {
        if (interaction.deferred || interaction.replied) {
          await interaction.editReply({ embeds: [errorEmbed] });
        } else {
          await interaction.reply({ embeds: [errorEmbed], flags: [MessageFlags.Ephemeral] });
        }
      }
    } catch (replyError) {
      console.error(`⚠️ Impossibile inviare embed errore:`, replyError.message);
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
