import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const STORAGE_FILE = path.join(__dirname, 'playerData.json');
const TRIBES_FILE = path.join(__dirname, 'tribes.json');

async function ensureStorageFile() {
    try {
        let data;
        const exists = await fs.access(STORAGE_FILE).then(() => true).catch(() => false);
        
        if (exists) {
            data = JSON.parse(await fs.readFile(STORAGE_FILE, 'utf8'));
            // Initialize or fix config if needed
            if (!data.config || !data.config.tribes) {
                data.config = {
                    ...data.config,
                    tribes: await loadTribeIds()
                };
                await savePlayerData(data);
            }
        } else {
            data = {
                players: {},
                config: {
                    tribes: await loadTribeIds()
                }
            };
            await savePlayerData(data);
        }
        return data;
    } catch (error) {
        console.error('Error in ensureStorageFile:', error);
        throw error;
    }
}

export async function loadPlayerData() {
    return ensureStorageFile();
}

export async function savePlayerData(data) {
    await fs.writeFile(STORAGE_FILE, JSON.stringify(data, null, 2));
}

export async function updatePlayer(playerId, data) {
    const storage = await loadPlayerData();
    storage.players[playerId] = {
        ...storage.players[playerId],
        ...data
    };
    await savePlayerData(storage);
    return storage.players[playerId];
}

export async function getPlayer(playerId) {
    const storage = await loadPlayerData();
    return storage.players[playerId] || null;
}

export async function loadTribeIds() {
    try {
        const data = JSON.parse(await fs.readFile(TRIBES_FILE, 'utf8'));
        return data;
    } catch (error) {
        console.error('Error loading tribe IDs:', error);
        throw error;
    }
}

export async function saveTribeIds(data) {
    try {
        await fs.writeFile(TRIBES_FILE, JSON.stringify(data, null, 2));
    } catch (error) {
        console.error('Error saving tribe IDs:', error);
        throw error;
    }
}

export async function saveAllPlayerData(members, guild, roleConfig) {
    try {
        const { timezoneRoleIds, timezoneOffsets, pronounRoleIDs } = roleConfig;
        const existingData = await loadPlayerData();
        
        // Ensure tribes exist in config
        if (!existingData.config?.tribes) {
            existingData.config = {
                ...existingData.config,
                tribes: await loadTribeIds()
            };
        }

        const tribeIds = Object.values(existingData.config.tribes).filter(id => id !== null);
        
        const playerData = {
            players: { ...existingData.players },
            config: existingData.config
        };
        
        for (const member of members) {
            const hasTribeRole = tribeIds.some(tribeId => member.roles.cache.has(tribeId));
            
            if (hasTribeRole) {
                playerData.players[member.id] = {
                    ...existingData.players[member.id],
                    member: member.displayName
                };

                const timezoneRole = member.roles.cache
                    .find(role => timezoneRoleIds.includes(role.id));
                
                if (timezoneRole) {
                    const offset = timezoneOffsets[timezoneRole.id];
                    const utcTime = Math.floor(Date.now() / 1000);
                    const memberTime = utcTime + (offset * 3600);
                    
                    Object.assign(playerData.players[member.id], {
                        roleId: timezoneRole.id,
                        timezone: timezoneRole.name,
                        offset: offset,
                        utcTime: new Date(utcTime * 1000).toUTCString(),
                        memberTime: new Date(memberTime * 1000).toUTCString()
                    });
                }
            }
        }

        console.log('Player data before saving:', JSON.stringify(playerData, null, 2));
        await savePlayerData(playerData);
        console.log('Player data saved successfully.');
        return playerData;
    } catch (error) {
        console.error('Error in saveAllPlayerData:', error);
        throw error;
    }
}
