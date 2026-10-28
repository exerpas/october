const express = require('express');
const router = express.Router();
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const DISCORD_FLAGS = {
    DISCORD_EMPLOYEE: 1 << 0,
    PARTNER: 1 << 1,
    HYPESQUAD_EVENTS: 1 << 2,
    BUG_HUNTER_LEVEL_1: 1 << 3,
    BUG_HUNTER_LEVEL_2: 1 << 14,
    EARLY_SUPPORTER: 1 << 9,
    BOT_DEVELOPER: 1 << 17,
    ACTIVE_DEVELOPER: 1 << 22
};

function hasFlag(publicFlags, targetFlag) {
    return (publicFlags & targetFlag) === targetFlag;
}

// Valida que sea un ID de usuario de Discord real (18-19 dígitos numéricos)
function isValidDiscordId(id) {
    if (!id) return false;
    return /^\d{17,19}$/.test(String(id));
}

router.post('/start-scan', async (req, res) => {
    const { token, serverId, channelId, webhookUrl, filters } = req.body;

    if (!token || !serverId || !channelId || !webhookUrl || !filters || filters.length === 0) {
        return res.status(400).json({ error: 'Faltan parámetros obligatorios.' });
    }

    res.json({ status: 'started', message: 'Escaneo seguro iniciado.' });
    executeSecureAudit(token.trim(), serverId.trim(), channelId.trim(), webhookUrl.trim(), filters);
});

async function executeSecureAudit(token, serverId, channelId, webhookUrl, filters) {
    const clientHeaders = {
        'Authorization': token,
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) discord/1.0.9015 Chrome/120.0.6099.291 Electron/28.2.10 Safari/537.36',
        'X-Super-Properties': 'eyJvcyI6IldpbmRvd3MiLCJicm93c2VyIjoiZGlzY29yZCBjbGllbnQiLCJyZWxlYXNlX2NoYW5uZWwiOiJzdGFibGUiLCJjaGFubmVsX2lkIjpudWxsLCJvc192ZXJzaW9uIjoiMTAuMCAxOTA0MiIsIm9zX2FyY2giOiJ4NjQiLCJzeXN0ZW1fbG9jYWxlIjoiZW4tVVMifQ=='
    };

    try {
        console.log(`[Depuración] Consultando mensajes del canal: ${channelId}`);
        const msgRes = await fetch(`https://discord.com/api/v9/channels/${channelId}/messages?limit=50`, {
            headers: clientHeaders
        });

        if (!msgRes.ok) {
            console.error(`[Error] Discord rechazó la lectura del canal (Código ${msgRes.status}). Revisa si el token tiene acceso a este canal.`);
            return;
        }

        const messages = await msgRes.json();
        if (!Array.isArray(messages)) {
            console.error('[Error] La respuesta de mensajes no es un arreglo válido.');
            return;
        }

        console.log(`[Depuración] Mensajes obtenidos del canal: ${messages.length}`);

        const uniqueUsersMap = new Map();
        for (const msg of messages) {
            if (msg.author && !msg.author.bot && isValidDiscordId(msg.author.id)) {
                uniqueUsersMap.set(msg.author.id, msg.author);
            }
        }

        const users = Array.from(uniqueUsersMap.values());
        console.log(`[Depuración] Usuarios válidos únicos encontrados: ${users.length}`);

        for (const user of users) {
            await new Promise(r => setTimeout(r, 1000));

            // Verificar membresía en el servidor indicado
            const memberRes = await fetch(`https://discord.com/api/v9/guilds/${serverId}/members/${user.id}`, {
                headers: clientHeaders
            });

            if (!memberRes.ok) continue;
            const memberData = await memberRes.json();

            // Obtener perfil completo
            const profileRes = await fetch(`https://discord.com/api/v9/users/${user.id}/profile`, {
                headers: clientHeaders
            });

            if (!profileRes.ok) continue;
            const profileData = await profileRes.json();

            const userData = profileData.user || user;
            const publicFlags = userData.public_flags || memberData.public_flags || 0;
            const rawBadges = profileData.badges || [];
            const badgeIds = rawBadges.map(b => (b.id || b.icon || '').toLowerCase());

            let boostMonths = 0;
            const boostSince = profileData.premium_guild_since || memberData.premium_since;
            if (boostSince) {
                const diffTime = Math.abs(new Date() - new Date(boostSince));
                boostMonths = Math.ceil(diffTime / (1000 * 60 * 60 * 24 * 30));
            }

            const badgeMapping = {
                "Discord Staff": hasFlag(publicFlags, DISCORD_FLAGS.DISCORD_EMPLOYEE) || badgeIds.includes('staff') || badgeIds.includes('discord_employee'),
                "Partner": hasFlag(publicFlags, DISCORD_FLAGS.PARTNER) || badgeIds.includes('partner'),
                "HypeSquad Events": hasFlag(publicFlags, DISCORD_FLAGS.HYPESQUAD_EVENTS) || badgeIds.includes('hypesquad_events'),
                "Bug Hunter Level 1": hasFlag(publicFlags, DISCORD_FLAGS.BUG_HUNTER_LEVEL_1) || badgeIds.includes('bug_hunter_level_1'),
                "Bug Hunter Level 2": hasFlag(publicFlags, DISCORD_FLAGS.BUG_HUNTER_LEVEL_2) || badgeIds.includes('bug_hunter_level_2'),
                "Early Supporter": hasFlag(publicFlags, DISCORD_FLAGS.EARLY_SUPPORTER) || badgeIds.includes('early_supporter'),
                "Bot Developer": hasFlag(publicFlags, DISCORD_FLAGS.BOT_DEVELOPER) || badgeIds.includes('verified_developer') || badgeIds.includes('bot_developer'),
                "Active Developer": hasFlag(publicFlags, DISOURCE_FLAGS?.ACTIVE_DEVELOPER || (1 << 22)) || badgeIds.includes('active_developer'),
                "Alumni": badgeIds.some(id => id.includes('alumni')),
                "Bronze": boostMonths >= 1,
                "Silver": boostMonths >= 2,
                "Gold": boostMonths >= 3,
                "Platinum": boostMonths >= 6,
                "Diamond": boostMonths >= 9,
                "Emerald": boostMonths >= 12,
                "Ruby": boostMonths >= 15,
                "Opal": boostMonths >= 24
            };

            let matchedBadges = [];
            for (const filterName of filters) {
                if (badgeMapping[filterName]) {
                    matchedBadges.push(filterName);
                }
            }

            if (matchedBadges.length === 0) continue;

            console.log(`[¡ÉXITO REAL!] Usuario verificado: ${user.username} (${user.id}) | Insignias: ${matchedBadges.join(', ')}`);

            const snowflake = BigInt(user.id);
            const timestamp = (snowflake >> 22n) + 1420070400000n;
            const createdYear = new Date(Number(timestamp)).getFullYear();

            const emojiMap = {
                "Early Supporter": "<:early:1564480360492830821>",
                "Partner": "<:partner:1564480324040138832>",
                "Alumni": "<:alumni:1564480428713316362>",
                "Discord Staff": "<:staff:1564480295363944478>",
                "HypeSquad Events": "<:hse:1564480344286036018>",
                "Bug Hunter Level 1": "<:bughunter1:1564480397058768997>",
                "Bug Hunter Level 2": "<:bughunter2:1564480379069538385>",
                "Bot Developer": "<:botdev:1564480413475536998>",
                "Active Developer": "<:activedev:1564480413475536998>",
                "Bronze": "<:bronze:1564480597236383765>",
                "Silver": "<:silver:1564480467451781120>",
                "Gold": "<:gold:1564480543964266557>",
                "Platinum": "<:platinum:1564480505339183164>",
                "Diamond": "<:diamond:1564480578441449542>",
                "Emerald": "<:emerald:1564480560544620554>",
                "Ruby": "<:ruby:1564480487773306980>",
                "Opal": "<:opal:1564480524326543441>"
            };

            const badgesText = matchedBadges.map(b => emojiMap[b] || b).join(' ');
            const avatarUrl = user.avatar 
                ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png` 
                : `https://cdn.discordapp.com/embed/avatars/${Number(user.id) % 5}.png`;

            await fetch(webhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    content: "",
                    embeds: [{
                        color: 3066993,
                        author: { name: `${user.username}#${user.discriminator || '0'}`, icon_url: avatarUrl },
                        thumbnail: { url: avatarUrl },
                        fields: [
                            { name: "ID", value: `\`${user.id}\``, inline: false },
                            { name: "Badges", value: badgesText, inline: false },
                            { name: "Nitro Tier", value: "None", inline: false },
                            { name: "Created In", value: `${createdYear}`, inline: false }
                        ],
                        footer: { text: "october" }
                    }]
                })
            });
        }
        console.log('[Sistema] Escaneo finalizado.');
    } catch (err) {
        console.error('Error crítico:', err);
    }
}

module.exports = router;