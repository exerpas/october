const express = require('express');
const router = express.Router();
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const MAX_MATCHES = 500;             
const DELAY_BETWEEN_PROFILES = 250;  

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

const getSuperProperties = () => {
    return Buffer.from(JSON.stringify({
        "os": "Windows",
        "browser": "Discord Client",
        "release_channel": "stable",
        "client_version": "1.0.9015",
        "os_version": "10.0.22631",
        "os_arch": "x64",
        "system_locale": "en-US"
    })).toString('base64');
};

async function fetchUserProfile(userId, headers) {
    let retries = 0;
    while (retries < 3) {
        try {
            const res = await fetch(`https://discord.com/api/v9/users/${userId}/profile?with_mutual_guilds=false`, { headers });
            
            if (res.status === 429) {
                const data = await res.json().catch(() => ({}));
                const waitTime = (data.retry_after ? data.retry_after * 1000 : 2500) + 200;
                await new Promise(r => setTimeout(r, waitTime));
                retries++;
                continue;
            }
            
            if (!res.ok) break;
            return await res.json();
        } catch (e) {
            break;
        }
    }
    return {};
}

function calculateNitroTier(profileData) {
    if (!profileData || Object.keys(profileData).length === 0) return null;

    let premiumDate = null;
    const badges = profileData.badges || [];

    if (profileData.premium_since) {
        premiumDate = new Date(profileData.premium_since);
    } else if (profileData.user && profileData.user.premium_since) {
        premiumDate = new Date(profileData.user.premium_since);
    }

    if (!premiumDate && badges.length > 0) {
        const premiumBadge = badges.find(b => 
            (b.id && (b.id.toLowerCase().includes('premium') || b.id.toLowerCase().includes('nitro'))) ||
            (b.description && /subscriber|suscriptor/i.test(b.description))
        );

        if (premiumBadge && premiumBadge.description) {
            const cleanDesc = premiumBadge.description.replace(/.*(since|desde)\s+/i, '').trim();
            const parsed = new Date(cleanDesc);
            if (!isNaN(parsed.getTime())) premiumDate = parsed;
        }
    }

    let nitroMonths = 0;
    if (premiumDate && !isNaN(premiumDate.getTime())) {
        const now = new Date();
        const diffTime = Math.abs(now - premiumDate);
        nitroMonths = Math.floor(diffTime / (1000 * 60 * 60 * 24 * 30.44));
    } else if (badges.some(b => b.id && (b.id.toLowerCase().includes('premium') || b.id.toLowerCase().includes('nitro')))) {
        nitroMonths = 1;
    } else {
        return null;
    }

    if (nitroMonths >= 72) return "Opal";
    if (nitroMonths >= 60) return "Ruby";
    if (nitroMonths >= 36) return "Emerald";
    if (nitroMonths >= 24) return "Diamond";
    if (nitroMonths >= 12) return "Platinum";
    if (nitroMonths >= 6) return "Gold";
    if (nitroMonths >= 3) return "Silver";
    return "Bronze";
}

const handleScanRequest = async (req, res) => {
    const { token, serverId, channelId, webhookUrl, filters } = req.body;

    if (!token || !serverId || !webhookUrl || !filters || filters.length === 0) {
        return res.status(400).json({ error: 'Faltan parámetros obligatorios.' });
    }

    const targetChannel = channelId || serverId;

    res.json({ 
        status: 'started', 
        message: `Escaneo directo de miembros iniciado para servidor ${serverId} y canal ${targetChannel}` 
    });

    executeMembersScan(token.trim(), serverId.trim(), targetChannel.trim(), webhookUrl.trim(), filters);
};

router.post('/start-scan', handleScanRequest);
router.post('/api/start-scan', handleScanRequest);

async function executeMembersScan(token, serverId, channelId, webhookUrl, filters) {
    const headers = {
        'Authorization': token,
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) discord/1.0.9015 Chrome/120.0.6099.291 Electron/28.2.10 Safari/537.36',
        'X-Super-Properties': getSuperProperties(),
        'Accept-Language': 'en-US,en;q=0.9'
    };

    try {
        console.log(`[October Members Scan] Conectando al objetivo -> Servidor ID: ${serverId}`);
        console.log(`[October Members Scan] Enrutando al canal establecido -> Canal ID: ${channelId}`);

        const globalSentUsers = new Set();
        let matchCount = 0;
        let afterParam = '';
        let fetchingMembers = true;

        // Bucle para extraer miembros directamente del servidor (activos y desconectados)
        while (fetchingMembers && matchCount < MAX_MATCHES) {
            let membersUrl = `https://discord.com/api/v9/guilds/${serverId}/members?limit=1000`;
            if (afterParam) membersUrl += `&after=${afterParam}`;

            const membersRes = await fetch(membersUrl, { headers });
            if (!membersRes.ok) {
                console.error(`[Error Members API] No se pudo obtener la lista de miembros del servidor. Status: ${membersRes.status}`);
                break;
            }

            const members = await membersRes.json();
            if (!Array.isArray(members) || members.length === 0) {
                break;
            }

            console.log(`[October Members Scan] Analizando lote de ${members.length} miembros (activos y desconectados)...`);

            for (const member of members) {
                if (matchCount >= MAX_MATCHES) break;
                if (!member.user || member.user.bot) continue;

                const userId = member.user.id;

                if (globalSentUsers.has(userId)) continue;
                globalSentUsers.add(userId);

                await new Promise(r => setTimeout(r, DELAY_BETWEEN_PROFILES));

                const profileData = await fetchUserProfile(userId, headers);
                const targetUser = profileData.user || member.user;
                const publicFlags = targetUser.public_flags || member.user.public_flags || targetUser.flags || 0;
                const badgesArray = profileData.badges || [];
                const badgeIds = badgesArray.map(b => (b.id || '').toLowerCase());

                const exactTier = calculateNitroTier(profileData);

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
                console.log(`[MATCH #${matchCount}/${MAX_MATCHES}] Miembro encontrado: ${targetUser.username} -> Nitro Tier: ${exactTier || 'None'}`);

                let specialBadgesList = [];
                const specialKeys = ["Discord Staff", "Partner", "HypeSquad Events", "Bug Hunter Level 1", "Bug Hunter Level 2", "Early Supporter", "Bot Developer", "Active Developer", "Alumni"];
                for (const sp of specialKeys) {
                    if (accountInventory[sp]) specialBadgesList.push(sp);
                }

                let nitroTierList = [];
                if (exactTier) nitroTierList.push(exactTier);

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

            if (members.length < 1000) {
                fetchingMembers = false;
            } else {
                afterParam = members[members.length - 1].user.id;
            }
        }

        console.log(`[October Members Scan] Escaneo de miembros finalizado. Total enviados a webhook: ${matchCount}`);
    } catch (err) {
        console.error('[Error Crítico en executeMembersScan]:', err);
    }
}

module.exports = router;