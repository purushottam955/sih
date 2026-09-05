const express = require('express');
const { uploadFile, generate, getAssessments, getAssessment, submit, getResult } = require('../controllers/assessmentController');
const auth = require('../middleware/auth');

const router = express.Router();

router.post('/generate', auth, uploadFile, generate);
router.get('/', auth, getAssessments);
router.get('/:id', auth, getAssessment);
router.post('/:id/submit', auth, submit);
router.get('/:id/result', auth, getResult);

module.exports = router;