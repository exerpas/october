const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '../data/keys.json');

function loadStore() {
  try {
    if (!fs.existsSync(DATA_FILE)) return [];
    let keys = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    
    // Verificación automática de expiración de llaves al cargar
    let modified = false;
    const now = Date.now();
    
    keys = keys.map(k => {
      if (k.status === 'active' && k.activatedAt && k.duration !== 'lifetime') {
        const days = parseInt(k.duration) || 1;
        const expirationTime = new Date(k.activatedAt).getTime() + (days * 24 * 60 * 60 * 1000);
        if (now > expirationTime) {
          k.status = 'revoked'; // o expired
          modified = true;
        }
      }
      return k;
    });

    if (modified) saveStore(keys);
    return keys;
  } catch {
    return [];
  }
}

function saveStore(keys) {
  try {
    const dir = path.dirname(DATA_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(keys, null, 2));
  } catch (e) {
    console.error('Error saving keys:', e);
  }
}

function list() {
  return loadStore();
}

function create(label = '', duration = '1', maxUses = 1) {
  const keys = loadStore();
  const randomPart = Math.random().toString(36).substring(2, 8).toUpperCase() + Math.random().toString(36).substring(2, 8).toUpperCase();
  const newKey = {
    id: Date.now().toString(),
    key: `OCTOBER-${randomPart}`,
    note: label,
    duration: duration, // '1', '7', '30', 'lifetime'
    maxUses: parseInt(maxUses) || 1,
    uses: 0,
    status: 'active',
    activatedAt: null,
    createdAt: new Date().toISOString()
  };
  keys.unshift(newKey);
  saveStore(keys);
  return newKey;
}

function findByKey(keyValue) {
  const keys = loadStore();
  const record = keys.find(k => k.key.toUpperCase() === keyValue.toUpperCase());
  
  if (!record || record.status !== 'active') return null;

  // Verificar si ya expiró por tiempo desde su primer uso
  if (record.activatedAt && record.duration !== 'lifetime') {
    const days = parseInt(record.duration) || 1;
    const expirationTime = new Date(record.activatedAt).getTime() + (days * 24 * 60 * 60 * 1000);
    if (Date.now() > expirationTime) {
      setStatus(record.id, 'revoked');
      return null;
    }
  }

  // Verificar si alcanzó el límite de usos máximos
  if (record.uses >= record.maxUses) {
    return null;
  }

  return record;
}

function touch(record) {
  const keys = loadStore();
  const index = keys.findIndex(k => k.id === record.id);
  if (index !== -1) {
    keys[index].uses = (keys[index].uses || 0) + 1;
    if (!keys[index].activatedAt) {
      keys[index].activatedAt = new Date().toISOString(); // Comienza a correr el tiempo al primer uso
    }
    saveStore(keys);
  }
}

function setStatus(id, status) {
  const keys = loadStore();
  const index = keys.findIndex(k => k.id === id);
  if (index === -1) return null;
  keys[index].status = status;
  saveStore(keys);
  return keys[index];
}

function remove(id) {
  let keys = loadStore();
  const initialLength = keys.length;
  keys = keys.filter(k => k.id !== id);
  saveStore(keys);
  return keys.length < initialLength;
}

module.exports = { list, create, findByKey, touch, setStatus, remove };