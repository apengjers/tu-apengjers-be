const express = require('express');
const midtransController = require('../controllers/midtransController');

const router = express.Router();

router.post('/charge', midtransController.createPayment);
router.post('/snap', midtransController.createSnapToken);
router.post('/notification', midtransController.handleNotification);
router.get('/status/:orderCode', midtransController.syncStatus);

module.exports = router;
