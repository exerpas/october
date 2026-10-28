const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

require('dotenv').config();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Importar rutas
const scanRoutes = require('./routes/scan');
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');

app.use('/', scanRoutes);
app.use('/', authRoutes);

// 1. La ruta /admin ahora sirve directamente tu interfaz visual HTML
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// 2. Las acciones de las llaves quedan protegidas en /api/admin
app.use('/api/admin', adminRoutes);

app.get('/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

app.listen(PORT, () => {
    console.log(`Servidor backend ejecutándose en el puerto ${PORT}`);
});