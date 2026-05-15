import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

export const ticketCommand = new SlashCommandBuilder()
  .setName('ems-ticket')
  .setDescription('Mostra il pannello di creazione ticket EMS');

export const ticketAddCommand = new SlashCommandBuilder()
  .setName('ticket-add')
  .setDescription('Aggiungi una persona a un ticket aperto')
  .addUserOption((opt) => opt.setName('user').setDescription('Utente da aggiungere').setRequired(true));

export function buildTicketEmbed(user, category, roleId, client) {
  const embed = new EmbedBuilder()
    .setTitle('🎫 Ticket EMS')
    .setDescription('Ti assisteremo a breve — descrivi il tuo problema nel canale qui sotto.')
    .addFields(
      { name: 'Categoria', value: `**${category}**`, inline: true },
      { name: 'Creato da', value: `${user.tag}`, inline: true },
      { name: 'Ruolo autorizzato', value: roleId ? `<@&${roleId}>` : 'Nessuno configurato', inline: false }
    )
    .setColor(0x22AAFF)
    .setTimestamp();

  try {
    if (client?.user) embed.setImage(client.user.displayAvatarURL({ size: 1024 }));
  } catch (e) {
    // ignore
  }

  return embed;
}
