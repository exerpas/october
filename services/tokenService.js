// services/tokenService.js
const axios = require('axios');

async function validateAndScanTokens(tokensArray) {
    const validAccounts = [];

    for (const token of tokensArray) {
        try {
            // Realizar la consulta real a la API de Discord (o la fuente de datos correspondiente)
            const response = await axios.get('https://discord.com/api/v9/users/@me', {
                headers: { Authorization: token.trim() }
            });

            if (response.data && response.data.id) {
                validAccounts.push({
                    id: response.data.id,
                    username: response.data.username,
                    discriminator: response.data.discriminator,
                    flags: response.data.public_flags,
                    token: token.trim()
                });
            }
        } catch (error) {
            // Token inválido o erróneo, se omite de los resultados reales
            console.error(`Token inválido omitido: ${error.message}`);
        }
    }

    return validAccounts;
}

rys = { validateAndScanTokens };