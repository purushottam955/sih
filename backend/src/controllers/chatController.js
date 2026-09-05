const { generateResponse } = require('../services/chatService');

exports.chat = async (req, res, next) => {
  try {
    const { message } = req.body;
    if (!message) return res.status(400).json({ success: false, message: 'Message required' });
    const response = await generateResponse(req.user.userId, message);
    res.json({ success: true, data: { response } });
  } catch (err) {
    next(err);
  }
};