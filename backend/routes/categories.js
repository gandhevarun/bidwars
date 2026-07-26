// routes/categories.js
const express = require('express');
const router = express.Router();
const { Category } = require('../models/index');

router.get('/', async (req, res) => {
  try {
    const categories = await Category.find({ isActive: true }).sort('sortOrder').lean();
    res.json({ success: true, categories });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
