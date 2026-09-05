const prisma = require('../config/db');

exports.getProfile = async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      include: {
        targetRole: true,
        userCompetencies: { include: { competency: true } },
      },
    });
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    res.json({ success: true, data: user });
  } catch (err) {
    next(err);
  }
};

exports.updateProfile = async (req, res, next) => {
  try {
    const { name, designation, department, qualification, email, targetRoleId } = req.body;
    const updated = await prisma.user.update({
      where: { id: req.user.userId },
      data: { name, designation, department, qualification, email, targetRoleId },
    });
    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
};