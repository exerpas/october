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

function testOfflineParsing() {
    console.log("[Test] Iniciando simulación offline del parseo de perfiles...\n");

    // Simulamos la respuesta exacta del endpoint /users/{id}/profile
    const mockProfileData = {
        "user": {
            "id": "822265182645649456",
            "username": "casacuecasa",
            "discriminator": "0",
            "public_flags": 0,
            "avatar": "753bb009632bfb0aedea0991863ed60d"
        },
        "premium_since": "2023-06-15T22:19:11.439000+00:00",
        "badges": [
            { "id": "premium_tenure_36_month_v2" },
            { "id": "guild_booster_lvl9" }
        ]
    };

    const targetUser = mockProfileData.user;
    const publicFlags = targetUser.public_flags;
    const badgesArray = mockProfileData.badges || [];
    const badgeIds = badgesArray.map(b => (b.id || '').toLowerCase());

    // 1. Cálculo matemático de Nitro
    let nitroMonths = 0;
    const premiumSince = mockProfileData.premium_since;
    if (premiumSince) {
        const premiumDate = new Date(premiumSince);
        // Usamos una fecha estática para la prueba para tener resultados predecibles (Octubre 2026)
        const now = new Date("2026-10-27T00:00:00Z");
        const diffTime = Math.abs(now - premiumDate);
        nitroMonths = Math.floor(diffTime / (1000 * 60 * 60 * 24 * 30.44));
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

    console.log(`-> Meses calculados de Nitro: ${nitroMonths}`);
    console.log(`-> Nivel asignado: ${exactTier || 'Ninguno'}\n`);

    // 2. Inventario de la cuenta
    const accountInventory = {
        "Early Supporter": (publicFlags & DISCORD_FLAGS.EARLY_SUPPORTER) !== 0 || badgeIds.some(s => s.includes('early')),
        "Bot Developer": (publicFlags & DISCORD_FLAGS.BOT_DEVELOPER) !== 0 || badgeIds.some(s => s.includes('developer')),
        "Discord Staff": (publicFlags & DISCORD_FLAGS.DISCORD_EMPLOYEE) !== 0 || badgeIds.some(s => s.includes('staff')),
        "Partner": (publicFlags & DISCORD_FLAGS.PARTNER) !== 0 || badgeIds.some(s => s.includes('partner')),
        "HypeSquad Events": (publicFlags & DISCORD_FLAGS.HYPESQUAD_EVENTS) !== 0 || badgeIds.some(s => s.includes('hypesquad')),
        "Bug Hunter Level 1": (publicFlags & DISCORD_FLAGS.BUG_HUNTER_LEVEL_1) !== 0 || badgeIds.some(s => s.includes('bug_hunter_1')),
        "Bug Hunter Level 2": (publicFlags & DISCORD_FLAGS.BUG_HUNTER_LEVEL_2) !== 0 || badgeIds.some(s => s.includes('bug_hunter_2')),
        "Active Developer": (publicFlags & DISCORD_FLAGS.ACTIVE_DEVELOPER) !== 0 || badgeIds.some(s => s.includes('active_developer')),
        "Alumni": badgeIds.some(s => s.includes('alumni'))
    };

    let specialBadgesList = [];
    const specialKeys = ["Discord Staff", "Partner", "HypeSquad Events", "Bug Hunter Level 1", "Bug Hunter Level 2", "Early Supporter", "Bot Developer", "Active Developer", "Alumni"];
    for (const sp of specialKeys) {
        if (accountInventory[sp]) specialBadgesList.push(sp);
    }

    let nitroTierList = exactTier ? [exactTier] : [];

    let badgesText = specialBadgesList.length > 0 
        ? specialBadgesList.map(b => getCustomEmoji(b)).join("  ") 
        : "None";

    let nitroTierText = nitroTierList.length > 0 
        ? nitroTierList.map(b => getCustomEmoji(b)).join("  ") 
        : "None";

    // 3. Generación del Embed de Webhook
    const snowflake = BigInt(targetUser.id);
    const timestamp = (snowflake >> 22n) + 1420070400000n;
    const createdYear = new Date(Number(timestamp)).getFullYear();

    const avatarUrl = targetUser.avatar 
        ? `https://cdn.discordapp.com/avatars/${targetUser.id}/${targetUser.avatar}.png` 
        : `https://cdn.discordapp.com/embed/avatars/${Number(targetUser.id) % 5}.png`;

    const finalEmbedPayload = {
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
            footer: { text: "october test" }
        }]
    };

    console.log("[Test] Carga útil del Webhook generada exitosamente:");
    console.log(JSON.stringify(finalEmbedPayload, null, 2));
}

testOfflineParsing();