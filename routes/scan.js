const express = require('express');
const router = express.Router();
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const MAX_TOTAL_USERS = 300; // Límite máximo global de cuentas a evaluar
const BATCH_SIZE = 50;        // Tamaño de cada lote para escaneo

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

function getCustomEmoji(badgeName) {
    const emojiMap = {
        "Early Supporter": "<:EarlySupporter:1089233228268851260>",
        "Partner": "<:partner:1362105185094336622>",
        "Alumni": "<:quest:1362105209496801290>",
        "Discord Staff": "<:staff:1362105228719034679>",
        "HypeSquad Events": "<:events:1362105087006212456>",
        "Bug Hunter Level 1": "<:bughunter1:1362105034157981758>",
        "Bug Hunter Level 2": "<:bughunter2:1362105047462314293>",
        "Bot Developer": "<:dev:1362105068060676329>",
        "Active Developer": "<:activedev:1362104965065212074>",
        "Bronze": "<:bronze:1365454925357645994>",
        "Silver": "<:silver:1365454972962996254>",
        "Gold": "<:gold:1365454994337435739>",
        "Platinum": "<:platinum:1365455020690243737>",
        "Diamond": "<:diamond:1365455075937488967>",
        "Emerald": "<:emerald:1365455096296509524>",
        "Ruby": "<:ruby:1365455125187137536>",
        "Opal": "<:opal:1365455150260551740>"
    };
    return emojiMap[badgeName] || badgeName;
}

const handleScanRequest = async (req, res) => {
    const { token, serverId, webhookUrl, filters } = req.body;

    if (!token || !serverId || !webhookUrl || !filters || filters.length === 0) {
        return res.status(400).json({ error: 'Faltan parámetros obligatorios.' });
    }

    res.json({ 
        status: 'started', 
        message: `Escaneo por lotes de ${BATCH_SIZE} iniciado (máximo ${MAX_TOTAL_USERS} cuentas).` 
    });

    executeStrictScan(token.trim(), serverId.trim(), webhookUrl.trim(), filters);
};

router.post('/start-scan', handleScanRequest);
router.post('/api/start-scan', handleScanRequest);

async function executeStrictScan(token, serverId, webhookUrl, filters) {
    const headers = {
        'Authorization': token,
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) discord/1.0.9015 Chrome/120.0.6099.291 Electron/28.2.10 Safari/537.36'
    };

    try {
        console.log(`[October Scan] Conectando al servidor ID: ${serverId}...`);
        const channelsRes = await fetch(`https://discord.com/api/v9/guilds/${serverId}/channels`, { headers });

        if (!channelsRes.ok) {
            console.error('[October Scan Error] No se pudieron obtener los canales del servidor.');
            return;
        }

        const channels = await channelsRes.json();
        const textChannels = channels.filter(c => c.type === 0);
        console.log(`[October Scan] ${textChannels.length} canales detectados. Recolectando hasta ${MAX_TOTAL_USERS} cuentas activas...`);

        const uniqueUsersMap = new Map();

        // 1. Recolectar hasta alcanzar el tope de MAX_TOTAL_USERS (300)
        for (const channel of textChannels) {
            if (uniqueUsersMap.size >= MAX_TOTAL_USERS) break;

            try {
                let lastMessageId = null;
                for (let batch = 0; batch < 2; batch++) {
                    if (uniqueUsersMap.size >= MAX_TOTAL_USERS) break;

                    let url = `https://discord.com/api/v9/channels/${channel.id}/messages?limit=100`;
                    if (lastMessageId) url += `&before=${lastMessageId}`;

                    const msgRes = await fetch(url, { headers });
                    if (!msgRes.ok) break;

                    const messages = await msgRes.json();
                    if (!Array.isArray(messages) || messages.length === 0) break;

                    for (const msg of messages) {
                        if (msg.author && !msg.author.bot) {
                            uniqueUsersMap.set(msg.author.id, msg.author);
                            if (uniqueUsersMap.size >= MAX_TOTAL_USERS) break;
                        }
                        lastMessageId = msg.id;
                    }
                }
            } catch (e) {}
        }

        const usersList = Array.from(uniqueUsersMap.values()).slice(0, MAX_TOTAL_USERS);
        const totalBatches = Math.ceil(usersList.length / BATCH_SIZE);

        console.log(`[October Scan] Recolectadas ${usersList.length} cuentas. Se procesarán en ${totalBatches} lote(s) de ${BATCH_SIZE}.`);

        let totalMatchCount = 0;

        // 2. Procesar en lotes de 50 usuarios
        for (let b = 0; b < totalBatches; b++) {
            const batchUsers = usersList.slice(b * BATCH_SIZE, (b + 1) * BATCH_SIZE);
            const currentBatchNumber = b + 1;

            console.log(`[October Scan] ▶ Procesando Lote ${currentBatchNumber}/${totalBatches} (${batchUsers.length} usuarios)...`);

            for (const user of batchUsers) {
                await new Promise(r => setTimeout(r, 150));

                let profileData = {};
                try {
                    const profileRes = await fetch(`https://discord.com/api/v9/users/${user.id}/profile`, { headers });
                    if (profileRes.status === 429) {
                        const errData = await profileRes.json().catch(() => ({}));
                        const waitTime = (errData.retry_after ? errData.retry_after * 1000 : 2500) + 200;
                        console.log(`[Rate Limit 429] Esperando ${Math.round(waitTime)}ms en usuario ${user.username}...`);
                        await new Promise(r => setTimeout(r, waitTime));
                    } else if (profileRes.ok) {
                        profileData = await profileRes.json();
                    }
                } catch (e) {}

                const targetUser = profileData.user || user;
                const publicFlags = targetUser.public_flags || user.public_flags || targetUser.flags || 0;
                const badgesArray = profileData.badges || [];
                const badgeIds = badgesArray.map(badge => (badge.id || '').toLowerCase());

                // Detección de fecha de Nitro
                let premiumDate = null;

                if (profileData.premium_since) {
                    premiumDate = new Date(profileData.premium_since);
                } else if (profileData.user && profileData.user.premium_since) {
                    premiumDate = new Date(profileData.user.premium_since);
                }

                if (!premiumDate && badgesArray.length > 0) {
                    const premiumBadge = badgesArray.find(badge => 
                        (badge.id && badge.id.toLowerCase().includes('premium')) || 
                        (badge.description && /subscriber|suscriptor/i.test(badge.description))
                    );

                    if (premiumBadge && premiumBadge.description) {
                        const cleanDesc = premiumBadge.description.replace(/.*(since|desde)\s+/i, '').trim();
                        const parsed = new Date(cleanDesc);
                        if (!isNaN(parsed.getTime())) {
                            premiumDate = parsed;
                        }
                    }
                }

                let nitroMonths = 0;
                let exactTier = null;

                if (premiumDate && !isNaN(premiumDate.getTime())) {
                    const now = new Date();
                    const diffTime = Math.abs(now - premiumDate);
                    nitroMonths = Math.floor(diffTime / (1000 * 60 * 60 * 24 * 30.44));
                } else if (badgesArray.some(badge => badge.id && badge.id.toLowerCase().includes('premium'))) {
                    nitroMonths = 1;
                }

                if (nitroMonths >= 72) exactTier = "Opal";         
                else if (nitroMonths >= 60) exactTier = "Ruby";     
                else if (nitroMonths >= 36) exactTier = "Emerald";  
                else if (nitroMonths >= 24) exactTier = "Diamond";  
                else if (nitroMonths >= 12) exactTier = "Platinum"; 
                else if (nitroMonths >= 6) exactTier = "Gold";      
                else if (nitroMonths >= 3) exactTier = "Silver";    
                else if (nitroMonths >= 1) exactTier = "Bronze";    

                const accountInventory = {
                    "Early Supporter": (publicFlags & DISCORD_FLAGS.EARLY_SUPPORTER) !== 0 || badgeIds.some(s => s.includes('early')),
                    "Bot Developer": (publicFlags & DISCORD_FLAGS.BOT_DEVELOPER) !== 0 || badgeIds.some(s => s.includes('developer')),
                    "Discord Staff": (publicFlags & DISCORD_FLAGS.DISCORD_EMPLOYEE) !== 0 || badgeIds.some(s => s.includes('staff')),
                    "Partner": (publicFlags & DISCORD_FLAGS.PARTNER) !== 0 || badgeIds.some(s => s.includes('partner')),
                    "HypeSquad Events": (publicFlags & DISCORD_FLAGS.HYPESQUAD_EVENTS) !== 0 || badgeIds.some(s => s.includes('hypesquad')),
                    "Bug Hunter Level 1": (publicFlags & DISCORD_FLAGS.BUG_HUNTER_LEVEL_1) !== 0 || badgeIds.some(s => s.includes('bug_hunter_1')),
                    "Bug Hunter Level 2": (publicFlags & DISCORD_FLAGS.BUG_HUNTER_LEVEL_2) !== 0 || badgeIds.some(s => s.includes('bug_hunter_2')),
                    "Active Developer": (publicFlags & DISCORD_FLAGS.ACTIVE_DEVELOPER) !== 0 || badgeIds.some(s => s.includes('active_developer')),
                    "Alumni": badgeIds.some(s => s.includes('alumni')),
                    "Bronze": exactTier === "Bronze",
                    "Silver": exactTier === "Silver",
                    "Gold": exactTier === "Gold",
                    "Platinum": exactTier === "Platinum",
                    "Diamond": exactTier === "Diamond",
                    "Emerald": exactTier === "Emerald",
                    "Ruby": exactTier === "Ruby",
                    "Opal": exactTier === "Opal"
                };

                let matchesSearch = false;
                for (const filterName of filters) {
                    if (accountInventory[filterName]) {
                        matchesSearch = true;
                        break;
                    }
                }

                if (!matchesSearch) continue;

                totalMatchCount++;
                console.log(`[¡MATCH #${totalMatchCount}!] Usuario: ${targetUser.username} -> Nitro Tier: ${exactTier || 'None'}`);

                let specialBadgesList = [];
                const specialKeys = ["Discord Staff", "Partner", "HypeSquad Events", "Bug Hunter Level 1", "Bug Hunter Level 2", "Early Supporter", "Bot Developer", "Active Developer", "Alumni"];
                for (const sp of specialKeys) {
                    if (accountInventory[sp]) specialBadgesList.push(sp);
                }

                let nitroTierList = [];
                if (exactTier) {
                    nitroTierList.push(exactTier);
                }

                let badgesText = specialBadgesList.length > 0 
                    ? specialBadgesList.map(b => getCustomEmoji(b)).join("  ") 
                    : "None";

                let nitroTierText = nitroTierList.length > 0 
                    ? nitroTierList.map(b => getCustomEmoji(b)).join("  ") 
                    : "None";

                const snowflake = BigInt(targetUser.id);
                const timestamp = (snowflake >> 22n) + 1420070400000n;
                const createdYear = new Date(Number(timestamp)).getFullYear();

                const avatarUrl = targetUser.avatar 
                    ? `https://cdn.discordapp.com/avatars/${targetUser.id}/${targetUser.avatar}.png` 
                    : `https://cdn.discordapp.com/embed/avatars/${Number(targetUser.id) % 5}.png`;

                fetch(webhookUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        content: "",
                        embeds: [{
                            color: 9646314,
                            author: { name: `${targetUser.username}#${targetUser.discriminator || '0'}`, icon_url: avatarUrl },
                            thumbnail: { url: avatarUrl },
                            fields: [
                                { name: "ID", value: `\`${targetUser.id}\``, inline: false },
                                { name: "Badges", value: badgesText, inline: false },
                                { name: "Nitro Tier", value: nitroTierText, inline: false },
                                { name: "Created In", value: `${createdYear}`, inline: false }
                            ],
                            footer: { text: "october" }
                        }]
                    })
                }).catch(() => {});
            }

            console.log(`[October Scan] ✔ Lote ${currentBatchNumber}/${totalBatches} finalizado.`);
        }

        console.log(`[October Scan] Busqueda completa finalizada con exito. Total enviado a webhook: ${totalMatchCount}`);
    } catch (err) {
        console.error('Error en el escaneo:', err);
    }
}

module.exports = router;