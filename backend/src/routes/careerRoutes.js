const express = require('express');
const { getRoles, getPath } = require('../controllers/careerController');
const auth = require('../middleware/auth');

const router = express.Router();

router.get('/roles', auth, getRoles);
router.get('/path', auth, getPath);

module.exports = router;