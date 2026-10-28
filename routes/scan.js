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

    res.json({ status: 'started', message: 'Escaneo con reintento estricto de perfiles iniciado.' });

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
        console.log(`[October Scan] ${textChannels.length} canales detectados. Recolectando cuentas activas...`);

        const uniqueUsersMap = new Map();

        for (const channel of textChannels) {
            try {
                let lastMessageId = null;
                for (let batch = 0; batch < 4; batch++) {
                    let url = `https://discord.com/api/v9/channels/${channel.id}/messages?limit=100`;
                    if (lastMessageId) url += `&before=${lastMessageId}`;

                    const msgRes = await fetch(url, { headers });
                    if (!msgRes.ok) break;

                    const messages = await msgRes.json();
                    if (!Array.isArray(messages) || messages.length === 0) break;

                    for (const msg of messages) {
                        if (msg.author && !msg.author.bot) {
                            uniqueUsersMap.set(msg.author.id, msg.author);
                        }
                        lastMessageId = msg.id;
                    }
                    await new Promise(r => setTimeout(r, 20));
                }
            } catch (e) {}
        }

        const usersList = Array.from(uniqueUsersMap.values());
        console.log(`[October Scan] ${usersList.length} cuentas obtenidas. Consultando perfiles sin perder datos de Nitro...`);

        let matchCount = 0;

        for (const user of usersList) {
            // Pausa obligatoria de 1.2s entre perfiles para prevenir bloqueos agresivos de Discord
            await new Promise(r => setTimeout(r, 1200));

            let profileData = {};
            let fetchedSuccess = false;
            let retries = 0;

            // BUCLE DE REINTENTO HASTA QUE DISCORD ENTREGUE EL PERFIL REAL
            while (!fetchedSuccess && retries < 5) {
                try {
                    const profileRes = await fetch(`https://discord.com/api/v9/users/${user.id}/profile`, { headers });
                    
                    if (profileRes.status === 429) {
                        const errBody = await profileRes.json().catch(() => ({}));
                        const waitMs = (errBody.retry_after ? errBody.retry_after * 1000 : 3500) + 500;
                        console.log(`[Rate Limit 429] Reintentando ${user.username} en ${Math.round(waitMs)}ms (Intento ${retries + 1}/5)...`);
                        await new Promise(r => setTimeout(r, waitMs));
                        retries++;
                    } else if (profileRes.ok) {
                        profileData = await profileRes.json();
                        fetchedSuccess = true;
                    } else {
                        break;
                    }
                } catch (e) {
                    break;
                }
            }

            const targetUser = profileData.user || user;
            const publicFlags = targetUser.public_flags || user.public_flags || targetUser.flags || 0;
            const badgesArray = profileData.badges || [];
            const badgeIds = badgesArray.map(b => (b.id || '').toLowerCase());

            // EXTRAER FECHA DE NITRO
            let premiumDate = null;

            if (profileData.premium_since) {
                premiumDate = new Date(profileData.premium_since);
            } else if (profileData.user && profileData.user.premium_since) {
                premiumDate = new Date(profileData.user.premium_since);
            }

            if (!premiumDate && badgesArray.length > 0) {
                const premiumBadge = badgesArray.find(b => 
                    (b.id && b.id.toLowerCase().includes('premium')) || 
                    (b.description && /subscriber|suscriptor/i.test(b.description))
                );

                if (premiumBadge && premiumBadge.description) {
                    const dateMatch = premiumBadge.description.match(/([A-Za-z]{3,}\s+\d{1,2},\s+\d{4})|(\d{1,2}\s+[A-Za-z]{3,}\s+\d{4})/);
                    if (dateMatch) {
                        const parsed = new Date(dateMatch[0]);
                        if (!isNaN(parsed.getTime())) premiumDate = parsed;
                    }
                }
            }

            let nitroMonths = 0;
            if (premiumDate && !isNaN(premiumDate.getTime())) {
                const now = new Date();
                const diffTime = Math.abs(now - premiumDate);
                nitroMonths = Math.floor(diffTime / (1000 * 60 * 60 * 24 * 30.44));
            } else if (badgesArray.some(b => b.id && b.id.toLowerCase().includes('premium'))) {
                nitroMonths = 1;
            }

            let exactTier = null;
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

            matchCount++;
            console.log(`[¡MATCH ESTRICTO #${matchCount}!] Usuario: ${targetUser.username} -> Nitro Tier: ${exactTier || 'None'}`);

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
        console.log(`[October Scan] Búsqueda finalizada con éxito. Se enviaron ${matchCount} resultados a la webhook.`);
    } catch (err) {
        console.error('Error en el escaneo:', err);
    }
}

module.exports = router;