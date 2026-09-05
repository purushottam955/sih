const prisma = require('../config/db');
const { getCareerPath } = require('../services/careerService');

exports.getRoles = async (req, res, next) => {
  try {
    const roles = await prisma.role.findMany();
    res.json({ success: true, data: roles });
  } catch (err) {
    next(err);
  }
};

exports.getPath = async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      include: { targetRole: true },
    });
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    // For path, we need the current role's ID. We'll assume user's designation maps to a role.
    // For simplicity, we'll find a role with name containing "Statistical Officer"
    const currentRole = await prisma.role.findFirst({ where: { name: { contains: 'Statistical Officer' } } });
    if (!currentRole) return res.status(404).json({ success: false, message: 'Current role not found' });
    const pathData = await getCareerPath(req.user.userId, currentRole.id, user.targetRoleId);
    res.json({ success: true, data: pathData });
  } catch (err) {
    next(err);
  }
};