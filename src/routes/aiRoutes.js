const express = require('express');
const router = express.Router();
const { chatWithAI } = require('../controllers/aiController');
const { protect } = require('../middleware/authMiddleware'); // Remove 'protect' if you want to test without login first

// The route here is '/chat', combined with app.use('/api/ai') -> '/api/ai/chat'
router.post('/chat', protect, chatWithAI); 

module.exports = router;