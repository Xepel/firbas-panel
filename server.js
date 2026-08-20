require('dotenv').config();

const path = require('path');
const express = require('express');
const app = require('./app');

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.redirect('/');
});

app.listen(PORT, () => {
  console.log(`CyberMonks Panel running at http://localhost:${PORT}`);
});
