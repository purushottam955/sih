const express = require('express');
const { getAllCourses, getRecommended, getCourse, enroll, getExplainability } = require('../controllers/courseController');
const auth = require('../middleware/auth');

const router = express.Router();

router.get('/', auth, getAllCourses);
router.get('/recommended', auth, getRecommended);
router.get('/:id', auth, getCourse);
router.post('/:id/enroll', auth, enroll);
router.get('/:courseId/explain', auth, getExplainability);

module.exports = router;