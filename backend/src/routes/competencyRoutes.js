const express = require('express');
const { getMyCompetencies, getGaps, getRequirements } = require('../controllers/competencyController');
const auth = require('../middleware/auth');

const router = express.Router();

router.get('/me', auth, getMyCompetencies);
router.get('/gaps', auth, getGaps);
router.get('/requirements/:roleId', auth, getRequirements);

module.exports = router;