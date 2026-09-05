const prisma = require('../config/db');
const { getGaps, getSeverity } = require('../services/competencyService');

exports.getMyCompetencies = async (req, res, next) => {
  try {
    const userComps = await prisma.userCompetency.findMany({
      where: { userId: req.user.userId },
      include: { competency: true },
    });
    res.json({ success: true, data: userComps });
  } catch (err) {
    next(err);
  }
};

exports.getGaps = async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { targetRoleId: true },
    });
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    const result = await getGaps(req.user.userId, user.targetRoleId);
    const gapsWithSeverity = {};
    for (const [comp, data] of Object.entries(result.gaps)) {
      gapsWithSeverity[comp] = {
        ...data,
        severity: getSeverity(data.gap),
      };
    }
    res.json({ success: true, data: { gaps: gapsWithSeverity, totalGap: result.totalGap } });
  } catch (err) {
    next(err);
  }
};

exports.getRequirements = async (req, res, next) => {
  try {
    const { roleId } = req.params;
    const roleComps = await prisma.roleCompetency.findMany({
      where: { roleId },
      include: { competency: true },
    });
    res.json({ success: true, data: roleComps });
  } catch (err) {
    next(err);
  }
};