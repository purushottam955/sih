const { getNotifications, markAsRead } = require('../services/notificationService');

exports.getNotifications = async (req, res, next) => {
  try {
    const notifs = await getNotifications(req.user.userId);
    res.json({ success: true, data: notifs });
  } catch (err) {
    next(err);
  }
};

exports.markRead = async (req, res, next) => {
  try {
    const { id } = req.params;
    const updated = await markAsRead(id);
    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
};