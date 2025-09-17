import { SlashCommandBuilder, PermissionsBitField } from 'discord.js';
import { pokemonService } from '../../modules/pokemon/service.js';

const canManagePokemonConfig = (interaction) => {
  const ownerId = process.env.OWNER_ID?.trim();
  if (ownerId && interaction.user.id === ownerId) return true;
  if (interaction.memberPermissions?.has(PermissionsBitField.Flags.ManageGuild)) return true;
  return false;
};

const formatConfig = (config) => {
  return [
    `Spawn chance: **${(config.spawnChance * 100).toFixed(2)}%**`,
    `Cooldown: **${config.spawnCooldownSeconds.toFixed(1)}s** per channel`,
    `Despawn timeout: **${config.despawnSeconds.toFixed(1)}s**`,
    `Max Pokedex ID: **${config.maxPokemonId}**`,
  ].join('\n');
};

export default {
  data: new SlashCommandBuilder()
    .setName('pokemon')
    .setDescription('Pokemon mini-game commands')
    .addSubcommand((sub) =>
      sub
        .setName('catch')
        .setDescription('Try to catch the active wild Pokemon in this channel')
        .addStringOption((option) =>
          option
            .setName('name')
            .setDescription('Your best guess of the Pokemon name')
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName('hint')
        .setDescription('Get a hint for the current wild Pokemon (if one is active).'),
    )
    .addSubcommand((sub) =>
      sub
        .setName('stats')
        .setDescription('Check your Pokemon catch stats for this server.'),
    )
    .addSubcommand((sub) =>
      sub
        .setName('config')
        .setDescription('Adjust Pokemon spawn tuning (Manage Server or OWNER only).')
        .addNumberOption((option) =>
          option
            .setName('spawn_chance')
            .setDescription('Chance between 0.001 and 0.25 (represents 0.1% - 25%)')
            .setMinValue(0.001)
            .setMaxValue(0.25)
            .setRequired(false),
        )
        .addNumberOption((option) =>
          option
            .setName('cooldown_seconds')
            .setDescription('Minimum seconds between spawns in the same channel (>= 5)')
            .setMinValue(5)
            .setRequired(false),
        )
        .addNumberOption((option) =>
          option
            .setName('despawn_seconds')
            .setDescription('How long a wild Pokemon sticks around before fleeing (>= 30)')
            .setMinValue(30)
            .setRequired(false),
        )
        .addIntegerOption((option) =>
          option
            .setName('max_id')
            .setDescription('Limit Pokedex IDs (1 - 1010) for themed events')
            .setMinValue(1)
            .setMaxValue(1010)
            .setRequired(false),
        )
        .addBooleanOption((option) =>
          option
            .setName('reset_defaults')
            .setDescription('Reset back to environment defaults'),
        ),
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'catch') {
      const name = interaction.options.getString('name', true);
      await pokemonService.handleCatch(interaction, name);
      return;
    }

    if (subcommand === 'hint') {
      await pokemonService.handleHint(interaction);
      return;
    }

    if (subcommand === 'stats') {
      await pokemonService.handleStats(interaction);
      return;
    }

    if (subcommand === 'config') {
      if (!canManagePokemonConfig(interaction)) {
        await interaction.reply({ content: 'You need the Manage Server permission (or be the configured OWNER_ID) to adjust Pokemon settings.', ephemeral: true });
        return;
      }

      const reset = interaction.options.getBoolean('reset_defaults') ?? false;
      const spawnChance = interaction.options.getNumber('spawn_chance');
      const cooldownSeconds = interaction.options.getNumber('cooldown_seconds');
      const despawnSeconds = interaction.options.getNumber('despawn_seconds');
      const maxId = interaction.options.getInteger('max_id');

      if (reset) {
        const config = pokemonService.resetConfig();
        await interaction.reply({
          content: `Pokemon settings reset to defaults.\n${formatConfig(config)}`,
          ephemeral: true,
        });
        return;
      }

      if (typeof spawnChance !== 'number' && typeof cooldownSeconds !== 'number' && typeof despawnSeconds !== 'number' && typeof maxId !== 'number') {
        const config = pokemonService.getConfig();
        await interaction.reply({
          content: `Current Pokemon settings:\n${formatConfig(config)}`,
          ephemeral: true,
        });
        return;
      }

      const config = pokemonService.updateConfig({
        spawnChance,
        spawnCooldownSeconds: cooldownSeconds,
        despawnSeconds,
        maxId,
      });

      await interaction.reply({
        content: `Pokemon settings updated.\n${formatConfig(config)}`,
        ephemeral: true,
      });
    }
  },
};
