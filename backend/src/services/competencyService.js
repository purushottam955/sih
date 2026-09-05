const prisma = require('../config/db');

const getGaps = async (userId, targetRoleId) => {
  // Get user's current competencies
  const userComps = await prisma.userCompetency.findMany({
    where: { userId },
    include: { competency: true },
  });
  const currentMap = {};
  userComps.forEach(uc => { currentMap[uc.competencyId] = uc.level; });

  // Get required levels for target role
  const roleComps = await prisma.roleCompetency.findMany({
    where: { roleId: targetRoleId },
    include: { competency: true },
  });

  const gaps = {};
  let totalGap = 0;
  for (const rc of roleComps) {
    const current = currentMap[rc.competencyId] || 0;
    const gap = rc.requiredLevel - current;
    gaps[rc.competency.name] = {
      required: rc.requiredLevel,
      current: current,
      gap: gap,
    };
    totalGap += Math.max(0, gap);
  }
  return { gaps, totalGap };
};

const getSeverity = (gap) => {
  if (gap <= 0) return { label: 'No Gap', badge: 'badge-success', icon: '✅' };
  if (gap === 1) return { label: 'Low Gap', badge: 'badge-warning', icon: '⚠️' };
  return { label: 'High Gap', badge: 'badge-danger', icon: '❌' };
};

module.exports = { getGaps, getSeverity };