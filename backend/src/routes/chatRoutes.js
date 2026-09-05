const express = require('express');
const { chat } = require('../controllers/chatController');
const auth = require('../middleware/auth');

const router = express.Router();

router.post('/', auth, chat);

module.exports = router;