const prisma = require('../config/db');

exports.getEmployees = async (req, res, next) => {
  try {
    const employees = await prisma.user.findMany({
      where: { role: 'LEARNER' },
      include: {
        userCompetencies: { include: { competency: true } },
      },
    });
    // Format heatmap data
    const heatmap = employees.map(emp => {
      const comps = {};
      emp.userCompetencies.forEach(uc => {
        comps[uc.competency.name] = uc.level;
      });
      return {
        id: emp.id,
        name: emp.name,
        department: emp.department,
        competencies: comps,
      };
    });
    res.json({ success: true, data: heatmap });
  } catch (err) {
    next(err);
  }
};

exports.getHeatmap = async (req, res, next) => {
  try {
    const employees = await prisma.user.findMany({
      where: { role: 'LEARNER' },
      include: {
        userCompetencies: { include: { competency: true } },
      },
    });
    const allComps = await prisma.competency.findMany();
    const compNames = allComps.map(c => c.name);

    const heatmapData = employees.map(emp => {
      const compMap = {};
      emp.userCompetencies.forEach(uc => {
        compMap[uc.competency.name] = uc.level;
      });
      return {
        name: emp.name,
        department: emp.department,
        competencies: compNames.map(name => ({
          name,
          level: compMap[name] || 0,
        })),
      };
    });
    res.json({ success: true, data: heatmapData });
  } catch (err) {
    next(err);
  }
};