import dotenv from 'dotenv';
import { Client, GatewayIntentBits, Partials, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionFlagsBits, EmbedBuilder, Events, REST, Routes } from 'discord.js';

dotenv.config();

const {
  BOT_TOKEN,
  GUILD_ID,
  PANEL_CHANNEL_ID,
  TICKET_ROLE_ID,
  LOG_CHANNEL_ID,
  ADMIN_ROLE_ID,
  BANNER_URL,
  DISCORD_ICON_URL,
} = process.env;

if (!BOT_TOKEN || !GUILD_ID || !PANEL_CHANNEL_ID || !TICKET_ROLE_ID || !LOG_CHANNEL_ID || !ADMIN_ROLE_ID) {
  console.error('Errore: alcune variabili di ambiente mancano. Controlla .env');
  process.exit(1);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
  partials: [Partials.Channel],
});

const ticketButtons = [
  { label: '🛡️ ALTO COMANDO', style: ButtonStyle.Primary, id: 'ticket_ALTO_COMANDO', description: 'Richiedi supporto ad alto comando' },
  { label: '⚠️ SEGNALAZIONI', style: ButtonStyle.Secondary, id: 'ticket_SEGNALAZIONI', description: 'Apri un ticket per una segnalazione' },
  { label: 'ℹ️ INFO', style: ButtonStyle.Success, id: 'ticket_INFO', description: 'Chiedi informazioni generali' },
  { label: '🎉 PROMOZIONE', style: ButtonStyle.Danger, id: 'ticket_PROMOZIONE', description: 'Richiedi info su promozioni' },
];

function sanitizeChannelName(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/--+/g, '-')
    .replace(/^-|-$/g, '');
}

function buildPanelEmbed() {
  const embed = new EmbedBuilder()
    .setTitle('🎫 TICKET CREATE')
    .setDescription('Scegli la categoria giusta e apri il ticket corretto.\nUn ticket aperto alla volta.')
    .addFields(
      { name: '🛡️ ALTO COMANDO', value: 'Richiedi supporto ufficiale o decisioni di alto comando.', inline: false },
      { name: '⚠️ SEGNALAZIONI', value: 'Segnala problemi, abusi o comportamenti scorretti.', inline: false },
      { name: 'ℹ️ INFO', value: 'Chiedi informazioni sul server, regole o procedure.', inline: false },
      { name: '🎉 PROMOZIONE', value: 'Richiedi promozioni, vantaggi o eventi in corso.', inline: false },
      { name: '❗ ISTRUZIONI', value: 'Premi il bottone giusto qui sotto per aprire il ticket.', inline: false }
    )
    .setColor('#0d6efd')
    .setAuthor({ name: 'Developed by lupomannaro', iconURL: DISCORD_ICON_URL || undefined })
    .setFooter({ text: 'Developed by lupomannaro • onyx.xyz' });

  if (BANNER_URL) {
    embed.setImage(BANNER_URL);
  }

  if (DISCORD_ICON_URL) {
    embed.setThumbnail(DISCORD_ICON_URL);
  }

  return embed;
}

function buildTicketButtons() {
  const row = new ActionRowBuilder();
  ticketButtons.forEach((button) => {
    row.addComponents(
      new ButtonBuilder().setCustomId(button.id).setLabel(button.label).setStyle(button.style)
    );
  });
  return [row];
}

function buildTicketActionRow() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('close_ticket').setLabel('❌ CHIUDI').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('reclama_ticket').setLabel('📣 RECLAMA').setStyle(ButtonStyle.Secondary)
    ),
  ];
}

async function createTicketPanel(interaction) {
  if (!interaction.guild) return;

  const embed = buildPanelEmbed();
  const rows = buildTicketButtons();

  await interaction.reply({ content: 'Pannello ticket creato.', ephemeral: true });
  const channel = await interaction.guild.channels.fetch(PANEL_CHANNEL_ID);
  if (!channel || channel.type !== ChannelType.GuildText) {
    await interaction.followUp({ content: 'Errore: il canale panel non è stato trovato o non è un canale testuale.', ephemeral: true });
    return;
  }

  await channel.send({ embeds: [embed], components: rows });
}

async function getExistingTicketChannel(guild, userId) {
  return guild.channels.cache.find((c) => c.type === ChannelType.GuildText && c.topic === `ticket:${userId}`);
}

async function ensureTicketCategory(guild, categoryName) {
  let category = guild.channels.cache.find(
    (c) => c.type === ChannelType.GuildCategory && c.name.toLowerCase() === categoryName.toLowerCase()
  );

  if (!category) {
    category = await guild.channels.create({
      name: categoryName,
      type: ChannelType.GuildCategory,
    });
  }

  return category;
}

async function createTicketChannel(interaction, ticketType) {
  if (!interaction.guild || !interaction.member || !interaction.user) return null;
  const guild = interaction.guild;
  const existing = await getExistingTicketChannel(guild, interaction.user.id);

  if (existing) {
    await interaction.reply({ content: `Hai già un ticket aperto: ${existing}`, ephemeral: true });
    return null;
  }

  const categoryName = `Tickets - ${ticketType}`;
  const category = await ensureTicketCategory(guild, categoryName);

  const channelName = sanitizeChannelName(`ticket-${interaction.user.username}-${ticketType}`);
  const ticketRole = await guild.roles.fetch(TICKET_ROLE_ID);
  if (!ticketRole) {
    await interaction.reply({ content: 'Errore: ruolo ticket non trovato.', ephemeral: true });
    return null;
  }

  const channel = await guild.channels.create({
    name: channelName.slice(0, 90),
    type: ChannelType.GuildText,
    parent: category.id,
    topic: `ticket:${interaction.user.id}`,
    permissionOverwrites: [
      {
        id: guild.roles.everyone,
        deny: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages],
      },
      {
        id: interaction.user.id,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
      },
      {
        id: ticketRole.id,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
      },
      {
        id: ADMIN_ROLE_ID,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
      },
    ],
  });

  return channel;
}

function buildTicketEmbed(user, ticketType) {
  const embed = new EmbedBuilder()
    .setTitle(`Ticket aperto: ${ticketType}`)
    .setDescription(`Ciao ${user}!
TI ASSISTEREMO A BREVE.
Descrivi bene il tuo problema o la tua richiesta.`)
    .addFields(
      { name: 'Categoria', value: ticketType, inline: true },
      { name: 'Indicazioni', value: 'Fornisci informazioni chiare e dettagliate. Il team ticket risponderà qui.', inline: true }
    )
    .setColor('#1abc9c')
    .setAuthor({ name: 'Developed by lupomannaro', iconURL: DISCORD_ICON_URL || undefined })
    .setFooter({ text: 'Developed by lupomannaro • onyx.xyz' });

  if (DISCORD_ICON_URL) {
    embed.setThumbnail(DISCORD_ICON_URL);
  }

  return embed;
}

function userCanManage(interaction) {
  const member = interaction.member;
  if (!member || !interaction.guild) return false;
  const roleCache = member.roles?.cache || (member.roles ? member.roles : null);
  const hasTicketRole = roleCache?.has(TICKET_ROLE_ID);
  const hasAdminRole = roleCache?.has(ADMIN_ROLE_ID);
  return Boolean(hasTicketRole || hasAdminRole);
}

async function generateTranscript(channel) {
  const messages = await channel.messages.fetch({ limit: 100 });
  const sorted = messages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
  const lines = sorted.map((message) => {
    const timestamp = new Date(message.createdTimestamp).toISOString().replace('T', ' ').replace('Z', '');
    const author = `${message.author.tag}`;
    const content = message.content || '';
    const attachmentText = message.attachments.size > 0 ? ` [${message.attachments.map((a) => a.url).join(', ')}]` : '';
    return `[${timestamp}] ${author}: ${content}${attachmentText}`;
  });

  return lines.join('\n');
}

function parseTicketInfo(channel) {
  const ticketAuthorId = channel.topic?.startsWith('ticket:') ? channel.topic.split(':')[1] : null;
  const categoryName = channel.parent?.name || '';
  const ticketType = categoryName.replace(/^Tickets - /i, '') || channel.name.replace(/^ticket-/, '');
  return { ticketAuthorId, ticketType };
}

async function closeTicket(interaction) {
  if (!interaction.channel || interaction.channel.type !== ChannelType.GuildText) return;
  if (!userCanManage(interaction)) {
    await interaction.reply({ content: 'Solo il ruolo ticket o admin può chiudere questo ticket.', ephemeral: true });
    return;
  }

  const channel = interaction.channel;
  const { ticketAuthorId, ticketType } = parseTicketInfo(channel);
  const transcript = await generateTranscript(channel);
  const transcriptFile = { attachment: Buffer.from(transcript, 'utf-8'), name: `${channel.name}-transcript.txt` };
  const closedBy = `${interaction.user.tag}`;
  const openedBy = ticketAuthorId ? `<@${ticketAuthorId}>` : 'Utente non trovato';
  const openedById = ticketAuthorId || 'Sconosciuto';
  const reason = 'Risolto o chiuso da staff';

  const embed = new EmbedBuilder()
    .setTitle('📄 Transcript ticket')
    .setDescription(`Scarica questo file ed aprilo con il tuo browser per visualizzare il tuo ticket.`)
    .setColor('#2ecc71')
    .addFields(
      { name: 'Trascrizione del ticket', value: channel.name, inline: false },
      { name: 'Chiuso da', value: closedBy, inline: true },
      { name: 'Motivazione Chiusura', value: reason, inline: true },
      { name: 'Categoria ticket', value: ticketType || 'TICKET GENERALE', inline: true },
      { name: 'Aperto da', value: openedBy, inline: true },
      { name: 'ID Utente', value: openedById, inline: true }
    )
    .setFooter({ text: 'Staff EMS' })
    .setTimestamp();

  const logChannel = await interaction.guild.channels.fetch(LOG_CHANNEL_ID);
  if (logChannel && logChannel.isTextBased()) {
    await logChannel.send({ embeds: [embed], files: [transcriptFile] });
  }

  if (ticketAuthorId) {
    try {
      const member = await interaction.guild.members.fetch(ticketAuthorId);
      if (member) {
        await member.send({ embeds: [embed], files: [transcriptFile] });
      }
    } catch (err) {
      console.warn('Impossibile inviare DM al cliente:', err);
    }
  }

  await interaction.reply({ content: `✅ Ticket chiuso da ${interaction.user.tag}. Transcript inviato e canale eliminato.`, ephemeral: true });
  setTimeout(() => channel.delete().catch(() => {}), 3000);
}

async function reclamaTicket(interaction) {
  if (!interaction.channel || interaction.channel.type !== ChannelType.GuildText) return;
  if (!userCanManage(interaction)) {
    await interaction.reply({ content: 'Solo il ruolo ticket o admin può reclamare il ticket.', ephemeral: true });
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle('🔔 Reclamo ticket')
    .setDescription(`${interaction.user} ha reclamato questo ticket.`)
    .setColor('#ff8c00')
    .setTimestamp();

  await interaction.reply({ embeds: [embed], ephemeral: false });
}

client.once(Events.ClientReady, async () => {
  console.log(`Bot pronto come ${client.user.tag}`);

  const rest = new REST({ version: '10' }).setToken(BOT_TOKEN);
  const commandData = [
    {
      name: 'ticket-panel',
      description: 'Crea il pannello dei ticket nel canale panel configurato',
    },
  ];

  try {
    await rest.put(Routes.applicationGuildCommands(client.user.id, GUILD_ID), { body: commandData });
    console.log('Comandi slash registrati. Usa /ticket-panel nel server.');
  } catch (error) {
    console.error('Errore registrando i comandi slash:', error);
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isChatInputCommand()) {
    if (interaction.commandName === 'ticket-panel') {
      await createTicketPanel(interaction);
    }
    return;
  }

  if (!interaction.isButton()) return;

  if (interaction.customId.startsWith('ticket_')) {
    const ticketType = interaction.customId.split('_').slice(1).join(' ');
    const channel = await createTicketChannel(interaction, ticketType);

    if (!channel) return;

    const ticketEmbed = buildTicketEmbed(interaction.user, ticketType);
    const actionRow = buildTicketActionRow();
    const ticketRole = await interaction.guild.roles.fetch(TICKET_ROLE_ID);

    await interaction.reply({ content: `${ticketRole ? `<@&${ticketRole.id}>` : '@ticket'}
✅ Ticket creato: ${channel}
Ti assisteremo a breve.`, ephemeral: true });
    await channel.send({ embeds: [ticketEmbed], components: actionRow });
    return;
  }

  if (interaction.customId === 'close_ticket') {
    await closeTicket(interaction);
    return;
  }

  if (interaction.customId === 'reclama_ticket') {
    await reclamaTicket(interaction);
    return;
  }
});

client.login(BOT_TOKEN);
