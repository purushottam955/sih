const express = require('express');
const { getEmployees, getHeatmap } = require('../controllers/adminController');
const auth = require('../middleware/auth');
const roleCheck = require('../middleware/roleCheck');

const router = express.Router();

router.use(auth);
router.use(roleCheck('ADMIN'));

router.get('/employees', getEmployees);
router.get('/heatmap', getHeatmap);

module.exports = router;