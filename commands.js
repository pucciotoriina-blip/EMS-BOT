import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

export const ticketCommand = new SlashCommandBuilder()
  .setName('ems-ticket')
  .setDescription('Mostra il pannello di creazione ticket EMS');

export function buildTicketEmbed(user, category, roleId) {
  return new EmbedBuilder()
    .setTitle('🎫 Ticket EMS')
    .setDescription('Descrivi bene il problema, ti risponderemo subito.')
    .addFields(
      { name: 'Categoria', value: `**${category}**`, inline: true },
      { name: 'Creato da', value: `${user.tag}`, inline: true },
      { name: 'Ruolo autorizzato', value: roleId ? `<@&${roleId}>` : 'Nessuno configurato', inline: false }
    )
    .setColor(0x22AAFF)
    .setTimestamp();
}
